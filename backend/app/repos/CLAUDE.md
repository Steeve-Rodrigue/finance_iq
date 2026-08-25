# app/repos/ conventions

- Repos are the only layer permitted to issue database queries. Services and routers must never import `sqlalchemy` or touch a `Session`/`AsyncSession` directly.
- Every repo function should have a corresponding test in `tests/repos/`.

- This project is multi-tenant. Every repo function takes `user_id` as its first parameter — no exceptions. Never expose a function like `get_bill_by_id(bill_id)`; it must be `get_bill_by_id(user_id, bill_id)`.
- `users_repo.py` is the one exception: `users` is the root table, there's no tenant above it to scope by.
- Row-level security in Postgres is the second line of defence, not the first — application code must be correct on its own.
