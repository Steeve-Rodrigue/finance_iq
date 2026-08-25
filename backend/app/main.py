from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.config import settings
from app.database import engine
from app.routers import (
    auth,
    bill_line_items,
    bills,
    categories,
    elicitations,
    flags,
    health,
    users,
    vendors,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("startup", environment=settings.environment)
    yield
    await engine.dispose()
    logger.info("shutdown")


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(vendors.router)
app.include_router(bills.router)
app.include_router(bill_line_items.router)
app.include_router(flags.router)
app.include_router(elicitations.router)
