# app/models/ conventions

- Primary keys are `UUID`, generated client-side (`default=uuid.uuid4` on the model) - never
  auto-increment integers, never server-side `gen_random_uuid()`.
- Every table that logically belongs to a tenant/user carries `user_id` as a `NOT NULL` foreign
  key to `users.id`, indexed, and is the first parameter of every repo function that touches it.
  `users` itself is the one exception - there's no tenant above it to scope by.
- Every table except `users` gets `created_at` / `updated_at` as `TIMESTAMPTZ`, even when the
  schema description didn't list them: `created_at` is `server_default=func.now()`, `updated_at`
  is the same plus `onupdate=func.now()` at the ORM level. This is a standing implementation
  convention, not something that needs to appear in a schema description to apply.
- Money-shaped fields are `Numeric`, never `Float`. Quantities use `Numeric(12, 3)`; monetary
  amounts use `Numeric(12, 2)`.
- Small, closed vocabularies (status/stage-style fields) are Python `enum.StrEnum` classes mapped
  via SQLAlchemy `Enum(..., name=...)` with an explicit Postgres type name - never free-text
  strings - unless the schema description explicitly marks the field as open-ended/free-form
  (e.g. the now-removed `flags.flag_type` was deliberately left as a plain string, not an enum -
  same rule applies to any future free-form classification field).
  - Alembic doesn't autogenerate Postgres enum type creation/teardown correctly across
    `create_table`/`drop_table` boundaries: hand-written migrations must create every enum type
    before the first table that references it, and explicitly `DROP TYPE` each one in
    `downgrade()` after the last table using it has been dropped (dropping a table does not drop
    the enum type in Postgres).
  - `sqlalchemy.Enum(SomeStrEnum, name=...)` persists the Python member's `.name` (e.g.
    `"PENDING"`) by default, not its `.value` (e.g. `"pending"`) - even though `enum.StrEnum`
    makes those look interchangeable in Python. Since the Postgres enum type is created with the
    lowercase `.value`s, every `SAEnum(...)` column must pass
    `values_callable=lambda cls: [m.value for m in cls]` (or an equivalent module-level helper),
    or inserts fail with `invalid input value for enum ...`. Verified against a live Postgres
    instance while building this pass - this isn't theoretical.
- SQLAlchemy 2.0 style throughout: `Mapped[...]` / `mapped_column(...)`, never legacy
  `Column(...)`.
- A `UK` (unique key) marked on a column in a schema description, without an explicit scope, is
  implemented as a composite unique constraint on `(user_id, <column>)`, not a global unique
  constraint - a global unique constraint on a per-tenant vocabulary column (e.g. a category
  slug or vendor key) would make that value usable by only one user across the entire system,
  which contradicts this project's multi-tenant model. If a genuinely global uniqueness
  constraint is ever needed, it must be called out explicitly.
- Foreign keys to another in-scope entity are only given a bidirectional `relationship(...,
back_populates=...)` pair when the schema description's ERD actually draws that relationship
  arrow. FKs that exist as a column but aren't drawn as a relationship (e.g.
  `bill_line_items.category_id`) get a one-directional `relationship()` with no
  `back_populates` on the other side. `user_id` FKs get a one-directional `relationship()` to
  `User` without modifying `app/models/users.py`.
- Columns that a bill only acquires partway through the parsing/categorizing/auditing pipeline
  (see `/CLAUDE.md`'s decision loop) are nullable, even when the schema description doesn't say
  so explicitly - only the fields guaranteed to exist at the moment of creation (e.g.
  `bills.name`, `bills.storage_key`, `bills.file_hash`) are `NOT NULL`. This inference is
  specific to `bills`; don't apply it elsewhere without the same kind of stage-based reasoning to
  back it up.
- Every table that carries `user_id` (i.e. every table except `users`) must get Postgres
  row-level security when it's created, not as a deferred follow-up: `ALTER TABLE ... ENABLE/
FORCE ROW LEVEL SECURITY` plus a `CREATE POLICY <table>_isolation ON <table> USING (user_id =
current_setting('app.current_user_id', true)::uuid) WITH CHECK (...)` — see
  `app/migrations/versions/28263f87489e_enable_row_level_security.py` for the pattern. The app
  connects as a non-superuser role (`financeiq_app`, see `.env.example` and
  `docker/initdb/01-create-app-role.sh`) specifically so this can't be silently bypassed —
  `app/dependencies.py`'s `get_current_user` sets that session var on every authenticated
  request. Migrations themselves run via a separate schema-owner role
  (`MIGRATION_DATABASE_URL`), since the restricted app role can't run DDL.
