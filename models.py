# kvk6/models.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum

# --- All Pydantic Models and Enums are now in this file ---

class Status(str, Enum):
    NEW = "New"
    VETTING = "Vetting"
    VETTED = "Vetted"
    APPROVED = "Approved"
    FAILED = "Failed"
    REJECTED = "Rejected"

class Source(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    snippet: Optional[str] = None

class BaseCompany(BaseModel):
    id: int
    name: Optional[str] = None
    domain: str
    status: Status
    apollo_data: Optional[Dict] = None
    website_url: Optional[str] = None
    company_linkedin_url: Optional[str] = None
    group_name: Optional[str] = None

class MoveCompaniesRequest(BaseModel):
    company_ids: List[int]
    group_name: str

class VettedCompany(BaseCompany):
    unified_score: Optional[float] = None
    geography_score: Optional[int] = None
    geography_reasoning: Optional[str] = None
    geography_sources: Optional[List[Source]] = None
    industry_score: Optional[int] = None
    industry_reasoning: Optional[str] = None
    industry_sources: Optional[List[Source]] = None
    russia_score: Optional[int] = None
    russia_reasoning: Optional[str] = None
    russia_sources: Optional[List[Source]] = None
    size_score: Optional[int] = None
    size_reasoning: Optional[str] = None
    size_sources: Optional[List[Source]] = None
    investment_reasoning: Optional[str] = None
    business_summary: Optional[str] = None
    investments_summary: Optional[str] = None
    company_size: Optional[str] = None
    russia_ties: Optional[str] = None
    ukraine_ties_analysis: Optional[str] = None
    high_risk_regions_analysis: Optional[str] = None

class AddCompaniesRequest(BaseModel):
    domains: List[str]
    group_name: Optional[str] = None

class VetCompaniesRequest(BaseModel):
    company_ids: List[int]

class DeleteCompaniesRequest(BaseModel):
    company_ids: List[int]

class GeographyAnalysis(BaseModel):
    geography_score: int = Field(description="Integer 0-10 based on geopolitical factors.", ge=0, le=10)
    geography_reasoning: str = Field(description="Detailed reasoning for the geography score, citing sources.")

class IndustryAnalysis(BaseModel):
    industry_score: int = Field(description="Integer 0-10 on oil & gas investment fit.", ge=0, le=10)
    industry_reasoning: str = Field(description="Detailed reasoning for the industry score, citing sources.")

class RussiaAnalysis(BaseModel):
    russia_score: int = Field(description="Integer 0-10 for Russia ties (10 = no ties, 0 = significant ties).", ge=0, le=10)
    russia_reasoning: str = Field(description="Detailed reasoning for the Russia ties score, citing sources.")

class SizeAnalysis(BaseModel):
    size_score: int = Field(description="Integer 0-10 for company size (10 = ideal medium size).", ge=0, le=10)
    size_reasoning: str = Field(description="Detailed reasoning for the company size score, citing sources.")

class FinalAnalysis(BaseModel):
    investment_reasoning: str = Field(description="A clear 'Yes' or 'No' on thesis fit, with detailed reasoning.")
    business_summary: str = Field(description="Detailed summary of the company's business model.")
    investments_summary: str = Field(description="Detailed summary of investment focus, especially on oil & gas.")
    company_size: str = Field(description="A string describing the company's size.")
    russia_ties: str = Field(description="Detailed summary of any ties to Russia.")
    ukraine_ties_analysis: str = Field(description="Detailed summary of activities or support related to Ukraine.")
    high_risk_regions_analysis: str = Field(description="Detailed summary of activities in Africa and South America.")