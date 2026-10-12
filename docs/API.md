# MORO API (Apps Script web app)

`POST <web app URL>` with body (Content-Type `text/plain`): `{"action": "...", "token": "...", "payload": {...}}`
Response: `{"ok": true, "data": ...}` or `{"ok": false, "error": {"code": "...", "detail": "..."}}`.

| Action | Roles | Payload |
|---|---|---|
| `ping` | public | – |
| `auth.setup` | public, only while no user exists | `username, display_name, pin` |
| `auth.login` | public | `username, pin` → `token, user` |
| `auth.me`, `auth.changePin` | all | `old_pin, new_pin` |
| `data.bootstrap` | all | – → items, parties, locations, purposes, lists, recipes, balances, settings, permissions, version |
| `data.version` | all | – |
| `movements.query` | all (production: no prices) | `from, to, kinds[], item_id, party_id, doc_no, created_by, since_id, include_deleted, include_archive, limit` |
| `movements.save` | admin, storekeeper, purchasing | `movements: [{client_id, kind, date, party_id, item_id, qty, unit, price, per, amount, discount, doc_no, location, expiry, purpose, image}]` |
| `movements.update` | admin; others own entries | `movement_id, changes` |
| `movements.delete` | admin | `movement_id` |
| `items.save` / `parties.save` | admin, storekeeper, purchasing (rename/deactivate: admin; min stock: admin, purchasing) | item/party fields |
| `lists.save` | admin, purchasing | `list (FAST/SENSITIVE), item_ids` |
| `recipes.save` | admin | `product, lines[{item_id, qty_per_unit}]` |
| `requests.create` | admin, storekeeper, production | `date, party_id, note, client_id, lines[{item_id, qty}]` |
| `requests.list` | all | `status, all, limit` |
| `requests.fulfil` | admin, storekeeper | `request_id, date, client_id, lines[{line_no, qty}]` |
| `requests.cancel` | admin, storekeeper, production (own) | `request_id` |
| `users.list`, `users.save` | admin | user fields, `pin` to reset |
| `audit.list` | admin | `limit` |

Movement kinds and sign: RECEIPT +, SUPPLIER_RETURN −, ISSUE −, DEPT_RETURN +, PROD_CONSUME −, PROD_OUTPUT +, OPENING (migration).
