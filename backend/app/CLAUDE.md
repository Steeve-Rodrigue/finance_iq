# app/ conventions

## Layering

A request flows through exactly these layers, in order:

```
router -> service -> repo -> database
```

- **router**: parses/validates the HTTP request (via `schemas`), calls a service, translates the result (or a raised exception) into an HTTP response. No business logic here.
- **service**: implements business logic. Orchestrates one or more repo calls. Never issues a database query directly — that belongs in `repos`.
- **repo**: the only layer that issues database queries. Returns `models` instances or plain data, not HTTP-shaped objects.

## Error handling

- Services raise typed, domain-specific exceptions (e.g. a `NotFoundError`, `ConflictError`) — never `HTTPException`.
- Routers catch those typed exceptions and translate them into the appropriate `HTTPException` / status code. This keeps services usable outside an HTTP context (tests, background jobs, CLI).
