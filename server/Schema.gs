/**
 * Schema.gs – the sheets of the MORO database and their columns.
 * Every sheet has a single header row; data starts on row 2.
 * IDs are stable text keys (I0001, P001, M000001 ...); names are never used as keys.
 */
var SCHEMA = {
  Items:        ['item_id', 'name', 'category', 'unit', 'min_stock', 'image', 'active', 'aliases', 'created_at', 'store',
                 'sale_price', 'shop_orderable', 'pack_units', 'report_unit', 'final_price', 'store_unit'],
  Parties:      ['party_id', 'name', 'kind', 'active', 'ext_id'],
  Locations:    ['location_id', 'name', 'category', 'active', 'store'],
  Units:        ['unit', 'active'],
  Purposes:     ['purpose_id', 'name', 'active'],
  Movements:    ['movement_id', 'date', 'kind', 'party_id', 'item_id', 'qty', 'unit', 'price', 'per', 'amount', 'discount',
                 'final_amount', 'doc_no', 'category', 'location', 'expiry', 'expiry_text', 'image', 'purpose',
                 'created_by', 'created_at', 'legacy_ref', 'status', 'client_id', 'updated_by', 'updated_at',
                 'entry_qty', 'entry_unit'],
  Archive:      ['movement_id', 'date', 'kind', 'party_id', 'item_id', 'qty', 'unit', 'price', 'per', 'amount', 'discount',
                 'final_amount', 'doc_no', 'category', 'location', 'expiry', 'expiry_text', 'image', 'purpose',
                 'created_by', 'created_at', 'legacy_ref', 'status'],
  Balances:     ['item_id', 'qty', 'unit', 'last_expiry', 'updated_at'],
  Recipes:      ['product', 'item_id', 'qty_per_unit'],
  Lists:        ['list', 'item_id'],
  Requests:     ['request_id', 'date', 'party_id', 'requested_by', 'status', 'note', 'created_at', 'fulfilled_by', 'fulfilled_at',
                 'client_id'],
  RequestLines: ['request_id', 'line_no', 'item_id', 'qty', 'unit', 'issued_qty', 'movement_id'],
  ShopOrderLines: ['line_id', 'order_id', 'order_no', 'order_item_id', 'shop_party_id', 'item_id', 'qty', 'unit', 'reserved_qty',
                 'handed_qty', 'status', 'reason', 'note', 'created_at', 'updated_at', 'handed_by', 'handed_at', 'movement_ids',
                 'returned_qty', 'approved'],
  SpecialRequests: ['request_id', 'ext_id', 'order_id', 'order_no', 'shop_party_id', 'description', 'qty', 'unit', 'image', 'status',
                 'decided_by', 'decided_at', 'comment', 'item_id', 'created_at', 'updated_at'],
  Users:        ['user_id', 'username', 'display_name', 'role', 'pin_hash', 'pin_salt', 'active', 'created_at', 'last_login',
                 'pin_changed_ms', 'caps', 'stores'],
  Counts:       ['count_id', 'store', 'date', 'period', 'status', 'created_by', 'created_at', 'approved_by', 'approved_at', 'note'],
  CountLines:   ['count_id', 'item_id', 'theory_qty', 'counted_qty', 'counted_by', 'counted_at', 'adjust_movement_id', 'price'],
  Audit:        ['audit_id', 'at', 'user_id', 'action', 'entity', 'entity_id', 'before', 'after'],
  Contacts:     ['name', 'phone'],
  Reminders:    ['date', 'message'],
  Settings:     ['key', 'value']
};

/** Columns kept as plain text so Sheets never turns IDs, codes or dates into numbers/dates. */
var TEXT_COLUMNS = ['item_id', 'party_id', 'location_id', 'purpose_id', 'movement_id', 'request_id', 'user_id', 'audit_id',
                    'date', 'expiry', 'expiry_text', 'doc_no', 'last_expiry', 'created_at', 'updated_at', 'fulfilled_at',
                    'last_login', 'at', 'phone', 'pin_hash', 'pin_salt', 'value', 'pin_changed_ms', 'client_id',
                    'updated_at', 'legacy_ref', 'line_id', 'order_id', 'order_item_id', 'ext_id', 'handed_at', 'decided_at',
                    'shop_party_id'];
