use anchor_lang::prelude::*;

use crate::{
    constants::AD_SLOT_SEED,
    error::MarketplaceError,
    AdSlot, SlotPurchased, SlotStatus,
};

#[derive(Accounts)]
#[instruction(slot_id: u64)]
pub struct BuySlot<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [AD_SLOT_SEED, ad_slot.seller.as_ref(), &slot_id.to_le_bytes()],
        bump,
        constraint = ad_slot.slot_id == slot_id
    )]
    pub ad_slot: Account<'info, AdSlot>,

    #[account(mut, address = ad_slot.seller)]
    pub seller: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_buy_slot(ctx: Context<BuySlot>, slot_id: u64) -> Result<()> {
    require!(
        ctx.accounts.ad_slot.status == SlotStatus::Available,
        MarketplaceError::SlotNotAvailable
    );
    require_keys_neq!(
        ctx.accounts.buyer.key(),
        ctx.accounts.seller.key(),
        MarketplaceError::SelfPurchase
    );

    let price_lamports = ctx.accounts.ad_slot.price_lamports;
    let transfer_accounts = system_program::Transfer {
        from: ctx.accounts.buyer.to_account_info(),
        to: ctx.accounts.seller.to_account_info(),
    };
    let transfer_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_accounts,
    );
    system_program::transfer(transfer_context, price_lamports)?;

    let buyer = ctx.accounts.buyer.key();
    let seller = ctx.accounts.seller.key();
    let ad_slot = &mut ctx.accounts.ad_slot;
    ad_slot.buyer = Some(buyer);
    ad_slot.status = SlotStatus::Sold;

    emit!(SlotPurchased {
        ad_slot: ad_slot.key(),
        slot_id,
        seller,
        buyer,
        price_lamports,
    });

    Ok(())
}
