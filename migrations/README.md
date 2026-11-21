# Character XP contribution

Apply `20261121_character_account_xp.sql` in the Supabase SQL editor before deploying the updated API, then release the game client. The migration requires the existing `projectgg.game_characters` table and `public.award_custom_xp(uuid, integer, text, text)` function used by the current XP API.

Each newly earned character XP reward contributes the same amount to ProjectGG account XP. The game persists account-scoped event receipts separately from character/world saves and retries them in batches through authenticated `POST /api/xp/character-events`. The database checks character ownership and commits the event receipt with the account award in one transaction. Repeated requests return zero additional XP, including retries after character deletion. The profile receives a rank refresh notification after a new award.

Character deletion leaves the XP ledger intact. In-game cloud deletion waits for that character?s queued XP to settle. Loading, syncing or transferring saves does not generate XP events. Existing saved XP is not backfilled: older rewards may already have contributed, and level-based XP counters are not a reliable award history. Do not reconstruct awards from snapshots.

The migration is repeatable. Keep the receipt table when deploying future versions; deleting receipts would remove retry protection. Client-reported rewards retain the existing game trust model; this is duplicate protection, not a server-authoritative anti-cheat system.
