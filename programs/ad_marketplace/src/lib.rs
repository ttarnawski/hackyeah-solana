pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5dKLaVXqzR6Ja4GpkfseLCuPGDdnUFZ4cs6YkUSzMTdF");

#[program]
pub mod ad_marketplace {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        instructions::handle_initialize_config(ctx)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        listing_id: u64,
        kyb_id: u32,
        title: String,
        description: String,
        buyout_price: u64,
        initial_auction_end_ts: i64,
        cycle_duration: i64,
    ) -> Result<()> {
        instructions::handle_create_listing(
            ctx,
            listing_id,
            kyb_id,
            title,
            description,
            buyout_price,
            initial_auction_end_ts,
            cycle_duration,
        )
    }

    pub fn initialize_listing_metadata(
        ctx: Context<InitializeListingMetadata>,
        title: String,
        description: String,
        buyout_price: u64,
    ) -> Result<()> {
        instructions::handle_initialize_listing_metadata(ctx, title, description, buyout_price)
    }

    pub fn update_listing_metadata(
        ctx: Context<UpdateListingMetadata>,
        title: String,
        description: String,
    ) -> Result<()> {
        instructions::handle_update_listing_metadata(ctx, title, description)
    }

    pub fn verify_supplier_kyb(ctx: Context<VerifySupplierKyb>, is_verified: bool) -> Result<()> {
        instructions::handle_verify_supplier_kyb(ctx, is_verified)
    }

    pub fn place_bid(ctx: Context<PlaceBid>, bid_amount: u64, ad_url: String) -> Result<()> {
        instructions::handle_place_bid(ctx, bid_amount, ad_url)
    }

    pub fn claim_funds(ctx: Context<ClaimFunds>) -> Result<()> {
        instructions::handle_claim_funds(ctx)
    }
}
