from pydantic import BaseModel


class SubcategorizeResponse(BaseModel):
    categories_processed: int
    subcategories_created: int
