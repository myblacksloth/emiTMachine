# Banca ore straordinari

La funzionalita' e' controllata per singolo utente dal pannello admin.

## Permessi

- Admin/root possono abilitare o disabilitare la funzionalita' per un utente.
- Admin/root scelgono la modalita': `straordinari` oppure `banca ore`.
- Quando la funzionalita' viene disabilitata, il monte ore settimanale dell'utente viene cancellato.
- La rimozione dello stato "pagamento ricevuto" e' riservata agli admin.

## Monte ore

Quando la funzionalita' e' abilitata, l'utente trova la tab `Banca ore` e puo' impostare il monte ore settimanale.
Il valore viene salvato in minuti, puo' essere impostato una sola volta e non puo' essere modificato dall'utente.

## Calcolo settimanale

Le settimane sono calcolate sulla timezone dell'utente. La settimana corrente resta una preview; solo le settimane precedenti sono considerate consuntivate.

- In modalita' `straordinari`, le ore sopra il monte ore diventano straordinario della settimana. L'utente puo' segnare il pagamento come ricevuto una sola volta.
- In modalita' `banca ore`, il delta delle settimane chiuse aggiorna il residuo: le ore in piu' lo aumentano, le ore mancanti lo diminuiscono.

Il calcolo usa tutte le sessioni chiuse dell'utente. Il report mostra sempre la settimana corrente e ogni altra settimana in cui risulta almeno una sessione registrata.

Le sessioni con il tag `Not billable` vengono registrate e restano visibili nello storico attivita' e nei report generali, ma non contribuiscono al calcolo di straordinari o banca ore. Se una sessione ha piu' tag e uno di questi e' `Not billable`, l'intera sessione viene esclusa dalla banca ore. I minuti `No count` impostati su una sessione vengono sottratti dal totale effettivo prima del calcolo.

## Tabelle principali

- `users.overtime_enabled`: abilita la funzionalita' per l'utente.
- `users.overtime_mode`: `overtime` oppure `time_bank`.
- `users.weekly_work_minutes`: monte ore settimanale bloccato.
- `users.weekly_work_minutes_set_at`: momento da cui parte il calcolo.
- `overtime_payments`: settimane in modalita' straordinari marcate come pagate.

Per database gia' esistenti, applicare `backend/db/migrations/20260520_overtime_bank.sql`, `backend/db/migrations/20260520_not_billable_tag.sql`, `backend/db/migrations/20260520_tag_defaults_and_exclusivity.sql` e `backend/db/migrations/20260521_no_count_minutes.sql`. `backend/db/init.sql` contiene gia' lo schema completo per installazioni pulite.

## API

- `GET /api/overtime`: report personale.
- `POST /api/overtime/weekly-target`: imposta il monte ore una sola volta.
- `POST /api/overtime/payments`: marca una settimana chiusa come pagata.
- `PATCH /api/admin/users/:id/overtime-permission`: abilita/disabilita e imposta modalita'.
- `GET /api/admin/users/:id/overtime`: report admin per un utente.
- `DELETE /api/admin/users/:id/overtime-payments/:weekStart`: elimina lo stato pagato.
