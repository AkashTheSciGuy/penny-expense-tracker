import type {
  Config,
  Context,
} from "@netlify/functions";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;

const scrypt = promisify(scryptCallback);

const SESSION_COOKIE = "penny_session";

const SESSION_SECONDS =
  60 * 60 * 24 * 30;

const DEFAULT_CATEGORIES = [
  "Food & drinks",
  "Shopping",
  "Transport",
  "Housing",
  "Health",
  "Entertainment",
  "Travel",
  "Education",
  "Salary",
  "Other",
];

const accounts = new Set([
  "Debit card",
  "Credit card",
  "UPI",
  "Bank",
  "Cash",
  "Other",
]);

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  max: 1,

  ssl: process.env.DATABASE_URL
    ? {
      rejectUnauthorized: false,
    }
    : undefined,
});

/* ======================================================
   Response helpers
   ====================================================== */

function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  return Response.json(data, {
    status,

    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function error(
  message: string,
  status = 400,
) {
  return json(
    {
      error: message,
    },
    status,
  );
}

/* ======================================================
   Cookie / session helpers
   ====================================================== */

function cookieValue(
  req: Request,
  name: string,
) {
  const raw =
    req.headers.get("cookie") || "";

  for (const part of raw.split(";")) {
    const [key, ...value] =
      part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(
        value.join("="),
      );
    }
  }

  return null;
}

function hashToken(
  token: string,
) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

async function hashPassword(
  password: string,
) {
  const salt =
    randomBytes(16).toString(
      "hex",
    );

  const derived =
    (await scrypt(
      password,
      salt,
      64,
    )) as Buffer;

  return [
    "scrypt",
    salt,
    derived.toString("hex"),
  ].join("$");
}

async function verifyPassword(
  password: string,
  stored: string,
) {
  const [
    algorithm,
    salt,
    hash,
  ] = stored.split("$");

  if (
    algorithm !== "scrypt" ||
    !salt ||
    !hash
  ) {
    return false;
  }

  const expected =
    Buffer.from(hash, "hex");

  const actual =
    (await scrypt(
      password,
      salt,
      expected.length,
    )) as Buffer;

  return (
    expected.length ===
    actual.length &&
    timingSafeEqual(
      expected,
      actual,
    )
  );
}

function sessionCookie(
  req: Request,
  token: string,
  maxAge = SESSION_SECONDS,
) {
  const secure =
    new URL(req.url).protocol ===
      "https:"
      ? "; Secure"
      : "";

  return (
    `${SESSION_COOKIE}=` +
    `${encodeURIComponent(token)}; ` +
    `HttpOnly; Path=/; ` +
    `SameSite=Lax; ` +
    `Max-Age=${maxAge}` +
    secure
  );
}

async function createSession(
  req: Request,
  userId: string,
) {
  const token =
    randomBytes(32).toString(
      "base64url",
    );

  await pool.query(
    `
      INSERT INTO sessions (
        token_hash,
        user_id,
        expires_at
      )
      VALUES (
        $1,
        $2,
        now() + interval '30 days'
      )
    `,
    [
      hashToken(token),
      userId,
    ],
  );

  return sessionCookie(
    req,
    token,
  );
}

async function currentUser(
  req: Request,
) {
  const token =
    cookieValue(
      req,
      SESSION_COOKIE,
    );

  if (!token) {
    return null;
  }

  const result =
    await pool.query(
      `
        SELECT
          u.id,
          u.email
        FROM sessions s
        JOIN users u
          ON u.id = s.user_id
        WHERE
          s.token_hash = $1
          AND s.expires_at > now()
      `,
      [
        hashToken(token),
      ],
    );

  return (
    (result.rows[0] as
      | {
        id: string;
        email: string;
      }
      | undefined) ?? null
  );
}

/* ======================================================
   Validation
   ====================================================== */

function validEmail(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  );
}

function validUuid(
  value: string,
) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validCategoryName(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= 50
  );
}

function validCategoryBody(
  body: any,
) {
  if (
    !body ||
    !validCategoryName(
      body.name,
    ) ||
    typeof body.isRecurring !==
    "boolean"
  ) {
    return false;
  }

  if (!body.isRecurring) {
    return (
      body.recurringAmount ===
      null
    );
  }

  return (
    Number.isSafeInteger(
      body.recurringAmount,
    ) &&
    body.recurringAmount >= 1 &&
    body.recurringAmount <=
    99999999999
  );
}

function validTransaction(
  body: any,
) {
  return (
    body &&

    typeof body.title ===
    "string" &&

    body.title.trim().length <=
    120 &&

    Number.isSafeInteger(
      body.amount,
    ) &&

    body.amount >= 1 &&

    body.amount <=
    99999999999 &&

    (
      body.type ===
      "expense" ||
      body.type ===
      "income"
    ) &&

    validCategoryName(
      body.category,
    ) &&

    typeof body.account ===
    "string" &&

    accounts.has(
      body.account,
    ) &&

    typeof body.date ===
    "string" &&

    /^\d{4}-\d{2}-\d{2}$/.test(
      body.date,
    ) &&

    typeof body.notes ===
    "string" &&

    body.notes.length <= 1000
  );
}

function validBudget(
  body: any,
) {
  return (
    body &&

    validCategoryName(
      body.category,
    ) &&

    Number.isSafeInteger(
      body.amount,
    ) &&

    body.amount >= 1 &&

    body.amount <=
    99999999999 &&

    typeof body.month ===
    "string" &&

    /^\d{4}-(0[1-9]|1[0-2])$/.test(
      body.month,
    )
  );
}

async function categoryExists(
  userId: string,
  name: string,
) {
  const result =
    await pool.query(
      `
        SELECT 1
        FROM categories
        WHERE
          user_id = $1
          AND lower(name) =
              lower($2)
        LIMIT 1
      `,
      [
        userId,
        name.trim(),
      ],
    );

  return Boolean(
    result.rowCount,
  );
}

async function bodyJson(
  req: Request,
) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* ======================================================
   Main API handler
   ====================================================== */

async function handler(
  req: Request,
  _context: Context,
) {
  if (
    !process.env.DATABASE_URL
  ) {
    return error(
      "Server database is not configured.",
      500,
    );
  }

  const url =
    new URL(req.url);

  /*
   * Prevent cross-origin writes.
   * GET requests are unaffected.
   */
  if (
    ![
      "GET",
      "HEAD",
      "OPTIONS",
    ].includes(req.method)
  ) {
    const origin =
      req.headers.get("origin");

    if (
      origin &&
      origin !== url.origin
    ) {
      return error(
        "Invalid request origin.",
        403,
      );
    }
  }

  const path =
    url.pathname
      .replace(
        /^\/api\/?/,
        "",
      )
      .split("/")
      .filter(Boolean);

  try {
    /* ==================================================
       AUTH: SESSION
       ================================================== */

    if (
      req.method === "GET" &&
      path.join("/") ===
      "auth/session"
    ) {
      return json({
        user:
          await currentUser(req),
      });
    }

    /* ==================================================
       AUTH: REGISTER / LOGIN
       ================================================== */

    if (
      req.method === "POST" &&
      (
        path.join("/") ===
        "auth/register" ||
        path.join("/") ===
        "auth/login"
      )
    ) {
      const body =
        await bodyJson(req);

      const email =
        typeof body?.email ===
          "string"
          ? body.email
            .trim()
            .toLowerCase()
          : "";

      const password =
        typeof body?.password ===
          "string"
          ? body.password
          : "";

      if (
        !validEmail(email)
      ) {
        return error(
          "Enter a valid email address.",
        );
      }

      if (
        password.length < 12 ||
        password.length > 200
      ) {
        return error(
          "Password must be at least 12 characters.",
        );
      }

      /* ----------------------------------------------
         REGISTER
         ---------------------------------------------- */

      if (
        path[1] ===
        "register"
      ) {
        const existing =
          await pool.query(
            `
              SELECT 1
              FROM users
              WHERE email = $1
              LIMIT 1
            `,
            [email],
          );

        if (
          existing.rowCount
        ) {
          return error(
            "An account with that email already exists.",
            409,
          );
        }

        const passwordHash =
          await hashPassword(
            password,
          );

        const client =
          await pool.connect();

        let createdUser:
          | {
            id: string;
            email: string;
          }
          | undefined;

        try {
          await client.query(
            "BEGIN",
          );

          const created =
            await client.query<{
              id: string;
              email: string;
            }>(
              `
        INSERT INTO users (
          email,
          password_hash
        )
        VALUES (
          $1,
          $2
        )
        RETURNING
          id,
          email
      `,
              [
                email,
                passwordHash,
              ],
            );

          const userRow =
            created.rows[0];

          if (!userRow) {
            throw new Error(
              "User creation returned no row.",
            );
          }

          createdUser =
            userRow;

          await client.query(
            `
      INSERT INTO categories (
        user_id,
        name
      )
      SELECT
        $1,
        category_name
      FROM unnest(
        $2::text[]
      ) AS category_name
      ON CONFLICT
      DO NOTHING
    `,
            [
              userRow.id,
              DEFAULT_CATEGORIES,
            ],
          );

          await client.query(
            "COMMIT",
          );
        } catch (err: any) {
          await client.query(
            "ROLLBACK",
          );

          if (
            err?.code ===
            "23505"
          ) {
            return error(
              "An account with that email already exists.",
              409,
            );
          }

          throw err;
        } finally {
          client.release();
        }

        if (!createdUser) {
          return error(
            "Unable to create account.",
            500,
          );
        }

        const cookie =
          await createSession(
            req,
            createdUser.id,
          );

        return json(
          {
            user:
              createdUser,
          },
          201,
          {
            "set-cookie":
              cookie,
          },
        );
      }

      /* ----------------------------------------------
         LOGIN
         ---------------------------------------------- */

      const found =
        await pool.query(
          `
            SELECT
              id,
              email,
              password_hash
            FROM users
            WHERE email = $1
          `,
          [email],
        );

      const row =
        found.rows[0];

      if (
        !row ||
        !(
          await verifyPassword(
            password,
            row.password_hash,
          )
        )
      ) {
        return error(
          "Invalid email or password.",
          401,
        );
      }

      const cookie =
        await createSession(
          req,
          row.id,
        );

      return json(
        {
          user: {
            id: row.id,
            email: row.email,
          },
        },
        200,
        {
          "set-cookie":
            cookie,
        },
      );
    }

    /* ==================================================
       AUTH: LOGOUT
       ================================================== */

    if (
      req.method === "POST" &&
      path.join("/") ===
      "auth/logout"
    ) {
      const token =
        cookieValue(
          req,
          SESSION_COOKIE,
        );

      if (token) {
        await pool.query(
          `
            DELETE FROM sessions
            WHERE token_hash = $1
          `,
          [
            hashToken(token),
          ],
        );
      }

      return json(
        {
          ok: true,
        },
        200,
        {
          "set-cookie":
            sessionCookie(
              req,
              "",
              0,
            ),
        },
      );
    }

    /*
     * Everything below this point
     * requires an authenticated user.
     */

    const user =
      await currentUser(req);

    if (!user) {
      return error(
        "Please sign in to continue.",
        401,
      );
    }

    /* ==================================================
       CATEGORIES
       ================================================== */

    if (
      path[0] ===
      "categories"
    ) {
      /* ----------------------------------------------
         GET CATEGORIES
         ---------------------------------------------- */

      if (
        req.method === "GET" &&
        path.length === 1
      ) {
        const result =
          await pool.query(
            `
              SELECT
                id,
                name,

                is_recurring
                  AS "isRecurring",

                recurring_amount::float8
                  AS "recurringAmount"

              FROM categories

              WHERE user_id = $1

              ORDER BY
                lower(name)
            `,
            [
              user.id,
            ],
          );

        return json({
          data:
            result.rows,
        });
      }

      /* ----------------------------------------------
         CREATE CATEGORY
         ---------------------------------------------- */

      if (
        req.method === "POST" &&
        path.length === 1
      ) {
        const body =
          await bodyJson(req);

        if (
          !validCategoryBody(
            body,
          )
        ) {
          return error(
            "Invalid category data.",
          );
        }

        try {
          const result =
            await pool.query(
              `
                INSERT INTO categories (
                  user_id,
                  name,
                  is_recurring,
                  recurring_amount
                )
                VALUES (
                  $1,
                  $2,
                  $3,
                  $4
                )
                RETURNING
                  id,
                  name,

                  is_recurring
                    AS "isRecurring",

                  recurring_amount::float8
                    AS "recurringAmount"
              `,
              [
                user.id,
                body.name.trim(),
                body.isRecurring,
                body.recurringAmount,
              ],
            );

          return json(
            {
              data:
                result.rows[0],
            },
            201,
          );
        } catch (err: any) {
          if (
            err?.code ===
            "23505"
          ) {
            return error(
              "A category with that name already exists.",
              409,
            );
          }

          throw err;
        }
      }

      /* ----------------------------------------------
         UPDATE CATEGORY
         ---------------------------------------------- */

      if (
        req.method === "PUT" &&
        path.length === 2 &&
        validUuid(path[1])
      ) {
        const body =
          await bodyJson(req);

        if (
          !validCategoryBody(
            body,
          )
        ) {
          return error(
            "Invalid category data.",
          );
        }

        const client =
          await pool.connect();

        try {
          await client.query(
            "BEGIN",
          );

          const existing =
            await client.query(
              `
                SELECT
                  id,
                  name
                FROM categories
                WHERE
                  id = $1
                  AND user_id = $2
                FOR UPDATE
              `,
              [
                path[1],
                user.id,
              ],
            );

          if (
            !existing.rowCount
          ) {
            await client.query(
              "ROLLBACK",
            );

            return error(
              "Category not found.",
              404,
            );
          }

          const previousName =
            existing.rows[0]
              .name;

          const newName =
            body.name.trim();

          const updated =
            await client.query(
              `
                UPDATE categories
                SET
                  name = $1,
                  is_recurring = $2,
                  recurring_amount = $3
                WHERE
                  id = $4
                  AND user_id = $5
                RETURNING
                  id,
                  name,

                  is_recurring
                    AS "isRecurring",

                  recurring_amount::float8
                    AS "recurringAmount"
              `,
              [
                newName,
                body.isRecurring,
                body.recurringAmount,
                path[1],
                user.id,
              ],
            );

          if (
            previousName !==
            newName
          ) {
            await client.query(
              `
                UPDATE transactions
                SET category = $1
                WHERE
                  user_id = $2
                  AND category = $3
              `,
              [
                newName,
                user.id,
                previousName,
              ],
            );

            await client.query(
              `
                UPDATE budgets
                SET category = $1
                WHERE
                  user_id = $2
                  AND category = $3
              `,
              [
                newName,
                user.id,
                previousName,
              ],
            );
          }

          await client.query(
            "COMMIT",
          );

          return json({
            data:
              updated.rows[0],
          });
        } catch (err: any) {
          await client.query(
            "ROLLBACK",
          );

          if (
            err?.code ===
            "23505"
          ) {
            return error(
              "A category with that name already exists.",
              409,
            );
          }

          throw err;
        } finally {
          client.release();
        }
      }

      /* ----------------------------------------------
         DELETE CATEGORY
         ---------------------------------------------- */

      if (
        req.method ===
        "DELETE" &&
        path.length === 2 &&
        validUuid(path[1])
      ) {
        const existing =
          await pool.query(
            `
              SELECT
                id,
                name
              FROM categories
              WHERE
                id = $1
                AND user_id = $2
            `,
            [
              path[1],
              user.id,
            ],
          );

        if (
          !existing.rowCount
        ) {
          return error(
            "Category not found.",
            404,
          );
        }

        const categoryName =
          existing.rows[0].name;

        const used =
          await pool.query(
            `
              SELECT
                (
                  EXISTS (
                    SELECT 1
                    FROM transactions
                    WHERE
                      user_id = $1
                      AND category = $2
                  )
                  OR
                  EXISTS (
                    SELECT 1
                    FROM budgets
                    WHERE
                      user_id = $1
                      AND category = $2
                  )
                ) AS used
            `,
            [
              user.id,
              categoryName,
            ],
          );

        if (
          used.rows[0]?.used
        ) {
          return error(
            "This category is used by existing transactions or budgets. Edit those records before deleting the category.",
            409,
          );
        }

        await pool.query(
          `
            DELETE FROM categories
            WHERE
              id = $1
              AND user_id = $2
          `,
          [
            path[1],
            user.id,
          ],
        );

        return json({
          ok: true,
        });
      }
    }

    /* ==================================================
       TRANSACTIONS
       ================================================== */

    if (
      path[0] ===
      "transactions"
    ) {
      /* ----------------------------------------------
         GET TRANSACTIONS
         ---------------------------------------------- */

      if (
        req.method === "GET" &&
        path.length === 1
      ) {
        const result =
          await pool.query(
            `
              SELECT
                id,
                title,

                amount::float8
                  AS amount,

                type,
                category,
                account,

                to_char(
                  date,
                  'YYYY-MM-DD'
                ) AS date,

                notes

              FROM transactions

              WHERE user_id = $1

              ORDER BY
                date DESC,
                id
            `,
            [
              user.id,
            ],
          );

        return json({
          data:
            result.rows,
        });
      }

      /* ----------------------------------------------
         CREATE TRANSACTION
         ---------------------------------------------- */

      if (
        req.method === "POST" &&
        path.length === 1
      ) {
        const body =
          await bodyJson(req);

        if (
          !validTransaction(
            body,
          )
        ) {
          return error(
            "Invalid transaction data.",
          );
        }

        if (
          !(
            await categoryExists(
              user.id,
              body.category,
            )
          )
        ) {
          return error(
            "Selected category does not exist.",
          );
        }

        const result =
          await pool.query(
            `
              INSERT INTO transactions (
                user_id,
                title,
                amount,
                type,
                category,
                account,
                date,
                notes
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
              )
              RETURNING
                id,
                title,

                amount::float8
                  AS amount,

                type,
                category,
                account,

                to_char(
                  date,
                  'YYYY-MM-DD'
                ) AS date,

                notes
            `,
            [
              user.id,
              body.title.trim(),
              body.amount,
              body.type,
              body.category.trim(),
              body.account,
              body.date,
              body.notes.trim(),
            ],
          );

        return json(
          {
            data:
              result.rows[0],
          },
          201,
        );
      }

      /* ----------------------------------------------
         UPDATE / DELETE TRANSACTION
         ---------------------------------------------- */

      if (
        path.length === 2 &&
        validUuid(path[1])
      ) {
        if (
          req.method === "PUT"
        ) {
          const body =
            await bodyJson(req);

          if (
            !validTransaction(
              body,
            )
          ) {
            return error(
              "Invalid transaction data.",
            );
          }

          if (
            !(
              await categoryExists(
                user.id,
                body.category,
              )
            )
          ) {
            return error(
              "Selected category does not exist.",
            );
          }

          const result =
            await pool.query(
              `
                UPDATE transactions
                SET
                  title = $1,
                  amount = $2,
                  type = $3,
                  category = $4,
                  account = $5,
                  date = $6,
                  notes = $7
                WHERE
                  id = $8
                  AND user_id = $9
                RETURNING
                  id,
                  title,

                  amount::float8
                    AS amount,

                  type,
                  category,
                  account,

                  to_char(
                    date,
                    'YYYY-MM-DD'
                  ) AS date,

                  notes
              `,
              [
                body.title.trim(),
                body.amount,
                body.type,
                body.category.trim(),
                body.account,
                body.date,
                body.notes.trim(),
                path[1],
                user.id,
              ],
            );

          if (
            !result.rowCount
          ) {
            return error(
              "Transaction not found.",
              404,
            );
          }

          return json({
            data:
              result.rows[0],
          });
        }

        if (
          req.method ===
          "DELETE"
        ) {
          const result =
            await pool.query(
              `
                DELETE FROM transactions
                WHERE
                  id = $1
                  AND user_id = $2
                RETURNING id
              `,
              [
                path[1],
                user.id,
              ],
            );

          if (
            !result.rowCount
          ) {
            return error(
              "Transaction not found.",
              404,
            );
          }

          return json({
            ok: true,
          });
        }
      }
    }

    /* ==================================================
       BUDGETS
       ================================================== */

    if (
      path[0] === "budgets"
    ) {
      /* ----------------------------------------------
         GET BUDGETS
         ---------------------------------------------- */

      if (
        req.method === "GET" &&
        path.length === 1
      ) {
        const month =
          url.searchParams.get(
            "month",
          ) || "";

        if (
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(
            month,
          )
        ) {
          return error(
            "Invalid month.",
          );
        }

        const result =
          await pool.query(
            `
              SELECT
                id,
                category,

                amount::float8
                  AS amount,

                month

              FROM budgets

              WHERE
                user_id = $1
                AND month = $2

              ORDER BY
                lower(category)
            `,
            [
              user.id,
              month,
            ],
          );

        return json({
          data:
            result.rows,
        });
      }

      /* ----------------------------------------------
         CREATE / UPDATE BUDGET
         ---------------------------------------------- */

      if (
        req.method === "POST" &&
        path.length === 1
      ) {
        const body =
          await bodyJson(req);

        if (
          !validBudget(body)
        ) {
          return error(
            "Invalid budget data.",
          );
        }

        if (
          !(
            await categoryExists(
              user.id,
              body.category,
            )
          )
        ) {
          return error(
            "Selected category does not exist.",
          );
        }

        const result =
          await pool.query(
            `
              INSERT INTO budgets (
                user_id,
                category,
                amount,
                month
              )
              VALUES (
                $1,
                $2,
                $3,
                $4
              )

              ON CONFLICT (
                user_id,
                category,
                month
              )

              DO UPDATE SET
                amount =
                  EXCLUDED.amount

              RETURNING
                id,
                category,

                amount::float8
                  AS amount,

                month
            `,
            [
              user.id,
              body.category.trim(),
              body.amount,
              body.month,
            ],
          );

        return json({
          data:
            result.rows[0],
        });
      }

      /* ----------------------------------------------
         DELETE BUDGET
         ---------------------------------------------- */

      if (
        req.method ===
        "DELETE" &&
        path.length === 2 &&
        validUuid(path[1])
      ) {
        const result =
          await pool.query(
            `
              DELETE FROM budgets
              WHERE
                id = $1
                AND user_id = $2
              RETURNING id
            `,
            [
              path[1],
              user.id,
            ],
          );

        if (
          !result.rowCount
        ) {
          return error(
            "Budget not found.",
            404,
          );
        }

        return json({
          ok: true,
        });
      }
    }

    return error(
      "Not found.",
      404,
    );
  } catch (err) {
    console.error(
      "Penny API error:",
      err,
    );

    return error(
      "Server error. Please try again.",
      500,
    );
  }
}

export default handler;

export const config: Config = {
  path: "/api/*",
};