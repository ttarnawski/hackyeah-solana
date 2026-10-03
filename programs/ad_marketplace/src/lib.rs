pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("J3ejrxcdwFzS1MsYcPtA1XVvbssEuLhLSiu1zXf6YtJu");

#[program]
pub mod ad_marketplace {
    use super::*;

    pub fn create_slot(
        ctx: Context<CreateSlot>,
        slot_id: u64,
        price_lamports: u64,
        content_uri: String,
    ) -> Result<()> {
        crate::instructions::create_slot::handle_create_slot(
            ctx,
            slot_id,
            price_lamports,
            content_uri,
        )
    }

    pub fn buy_slot(ctx: Context<BuySlot>, slot_id: u64) -> Result<()> {
        crate::instructions::buy_slot::handle_buy_slot(ctx, slot_id)
    }

    pub fn cancel_slot(ctx: Context<CancelSlot>, slot_id: u64) -> Result<()> {
        crate::instructions::cancel_slot::handle_cancel_slot(ctx, slot_id)
    }
}
