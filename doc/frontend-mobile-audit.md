# Frontend Mobile UX Audit

_Generato il: 2026-05-23_

---

## 1. Viste principali e struttura

| Vista | Componente principale | Classi CSS chiave |
|---|---|---|
| Auth (login/register/passkey/recovery/totp) | `AuthPanel` | `.auth-layout`, `.auth-panel`, `.auth-copy`, `.tabs`, `.stack` |
| Dashboard | `Dashboard` → `Metric`, `Chart` | `.work-band`, `.summary-grid`, `.chart-grid`, `.section-nav` |
| Activities | `ActivityPanel` → `ActivityEditor` | `.activity-panel`, `.activity-card`, `.week-tabs`, `.activity-edit-grid`, `.activity-modal` |
| Calendar | `MonthlyCalendarPanel` | `.calendar-grid`, `.calendar-day`, `.calendar-weekdays`, `.activity-detail-modal` |
| Requests | `AdministrativeRequestsPanel` → `RequestList` | `.request-grid`, `.request-card`, `.request-actions`, `.history-modal`, `.history-filters` |
| Overtime | `OvertimePanel` | `.overtime-panel`, `.overtime-week`, `.overtime-week-stats`, `.overtime-week-list` |
| Tags | `TagManager` | `.tag-manager-grid`, `.tag-create-row`, `.tag-list`, `.tag-editor`, `.color-swatches` |
| Tools | `TimeTools` | `.time-tools-grid`, `.time-tool-card`, `.tool-row`, `.tool-num` |
| Countdowns | `Countdowns` | `.countdown-panel`, `.countdown-form`, `.countdown-grid`, `.countdown` |
| Profile / settings | `ProfileSettings` | `.settings-grid`, `.csv-actions`, `.codes`, `.qr` |
| Admin | `AdminPanel` → `AuditLogView` | `.admin-grid`, `.admin-user`, `.audit-table-wrap`, `.audit-table`, `.audit-filter-bar` |
| Punch dialog | `PunchDialog` → `SlideToConfirm` | `.modal`, `.slide-confirm`, `.tag-picker` |
| Critical dialog | `CriticalDialogHost` | `.critical-modal`, `.critical-backdrop`, `.modal-actions` |

---

## 2. Problemi per vista

### Auth

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.auth-layout` usa `grid-template-columns: minmax(0, 1fr) 420px`. A 920 px collassa a 1 colonna correttamente, ma tra 560 px e 920 px la colonna `.auth-copy` occupa tutto lo schermo e mostra il brand + sparks sopra il form, allungando la pagina; nessun `overflow: hidden` garantisce che il decoratore `::after` (larghezza `min(440px, 100%)`) non spinga il layout. | `.auth-layout`, `.auth-copy::after` | P2 | L'`overflow-x: hidden` su `.auth-copy` gestisce il decoratore, ma tra 560 e 920 la sezione testo occupa molto spazio verticale prima del form. |
| `.tabs` dentro `.auth-panel` ha `position: static` solo sotto 560 px (`@media (max-width: 560px) .auth-panel .tabs`). Tra 560 px e 920 px eredita `position: sticky; top: 0.35rem; z-index: 20` dalla regola `.tabs, .section-nav` del breakpoint 560. Dentro un `<main class="auth-layout">` senza `overflow: hidden`, lo sticky non è visibile, ma gli stili sono contraddittori. | `.tabs` dentro `.auth-panel`, `@media (max-width: 560px) .auth-panel .tabs` | P2 | Il reset `position: static` al breakpoint 560 è corretto; tra 560 e 920 la `.tabs` eredita la regola sticky del breakpoint 920 senza il reset → si comporta come sticky fuori dal pannello scroll. |
| I quattro tab di autenticazione ("Sign in", "Register", "Passkey", "Recovery") in `.tabs` con `flex-wrap: wrap` a 560–920 px si dispongono su più righe se la viewport è stretta. La larghezza del tab "Registration" è autofit: su uno schermo da 360 px potrebbe provocare avvolgimento a metà. | `.tabs button` dentro `.auth-panel` | P1 | Non esiste `min-width` per i singoli pulsanti tab dell'auth fuori dal breakpoint 560 (dove la sezione nav ha `min-width: 68px`). I tab auth non ricevono `flex: 0 0 auto` prima di 560 px. |
| `DateTimeField` emette `<input type="datetime-local">`. Su iOS Safari questo apre un date-time picker nativo che funziona ma occupa metà schermo. Nei form auth non è presente, ma nelle viste di recovery e totp compaiono field di tipo `text`/`password` che usano `font-size: 1rem` (sotto 560 px viene alzato a `font-size: 16px` dalla regola media query): corretto. | `.field input` a `@media (max-width: 560px)` | P2 | Il fix `font-size: 16px` a 560 px è corretto e previene il autozoom su iOS. Nessun problema. Annotato per completezza. |

### Dashboard (work-band + summary-grid + chart-grid)

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.summary-grid` ha `grid-template-columns: repeat(4, minmax(0, 1fr))` (ridecritto a repeat(4) nel blocco premium). A 920 px collassa a 2 colonne, a 560 px a 1 colonna. Questo funziona. Tuttavia il quarto metric "Presence / smart" mostra la stringa `${minutesLabel(presenceMinutes)} / ${minutesLabel(smartWorkingMinutes)}`, che può diventare `8h 30m / 6h 00m`: a `font-size: 1.6rem` (560 px) il testo supera la larghezza del `<strong>` con `overflow-wrap: anywhere`, ma a 1 colonna ci sono risorse sufficienti. A 2 colonne (560–920 px) il testo può essere stretto. | `.metric strong`, quarta card | P1 | `overflow-wrap: anywhere` è impostato su `.metric strong` (riga 783): il testo va a capo invece di uscire. Il rischio reale è l'aspetto, non l'overflow, ma la leggibilità è degradata su 360 px a 2 colonne. |
| `.chart-grid` ha `grid-template-columns: repeat(3, minmax(0, 1fr))`. Crolla a 1 colonna solo al breakpoint 920 px (regola originale nel blocco base). I grafici sono bar chart custom: `.bar-row` usa `grid-template-columns: 4.5rem minmax(0, 1fr) 4.2rem`. Questo è fluid. Non c'è overflow orizzontale. | `.chart-grid`, `.bar-row` | P2 | A 360 px le label `.bar-row span` (colonna fissa `4.5rem`) possono troncare stringhe di date lunghe ("Jan 10" = 6 char), ma non escono dal bordo. |
| `.section-nav` con 11+ bottoni (Dashboard, Activities, Calendar, Requests, Overtime, Tags, Tools, Countdowns, Profile, Admin, Audit log) a 560 px ottiene `overflow-x: auto; flex-wrap: nowrap; width: calc(100vw - 1rem)`. Corretto. Ma il `min-width: 68px` per ogni bottone moltiplicato per 11 = 748 px di larghezza minima scrollabile. Su 360 px la nav è scrollabile ma non c'è nessun indicatore visivo (fade, chevron) che suggerisca lo scroll. | `.section-nav` a `@media (max-width: 560px)` | P1 | Funziona tecnicamente, ma la discoverability è bassa. Nessun `mask-image` o gradient hint ai bordi. |
| `.work-band` a ≥920 px usa `grid-template-columns: minmax(0, 1fr) auto`. Il testo in `.session-state strong` (`font-size: 1.65rem`, testo `Started 23/05/2026, 09:30:00`) su una viewport da 768 px può spingersi sulla stessa riga del bottone `clock-action` (min-width `min(170px, 100%)`). Con date locali lunghe (es. locale italiano completo) c'è rischio di comprensione del testo. | `.work-band`, `.session-state strong` | P1 | A 920 px la `work-band` collassa a `grid-template-columns: 1fr` per la media query esistente. Il rischio esiste tra 920 e 1200 px su viewport strette. |
| Il bottone `.topbar-signout` viene nascosto (`display: none`) a 560 px e sostituito da `.mobile-signout` in fondo alla pagina. Corretto come approccio, ma `.mobile-signout` è l'ultimo elemento di `<main class="workspace">`. Dopo molte sezioni di contenuto, l'utente deve scorrere fino in fondo. Non è un problema di overflow, ma di accessibilità UX. | `.mobile-signout`, `.topbar-signout` | P2 | Design choice, non un bug. |

### Activities

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.week-tabs` usa `display: flex; flex-wrap: wrap; overflow-x: auto`. Quando i tab sono molti (es. 10+ settimane), i tab si avvolgono e l'overflow-x non entra mai in effetto poiché `flex-wrap: wrap` ha precedenza su `overflow-x: auto` (il contenitore si espande in altezza invece di scrollare). Su mobile la lista tab può diventare un blocco verticale enorme. | `.week-tabs` | P0 | `flex-wrap: wrap` e `overflow-x: auto` sono mutuamente esclusivi: con `wrap`, il flex container si espande in altezza e non crea overflow orizzontale. Serve `flex-wrap: nowrap` per far funzionare lo scroll. |
| `.activity-edit-grid` usa `grid-template-columns: repeat(2, minmax(0, 1fr))`. Crolla a 1 colonna a 560 px. Ma i campi "Start timezone" e "End timezone" sono `TextField` (input text libero) mostrati in 2 colonne a 560–920 px, il che li rende molto stretti (≈ 150 px su 360 px). Su iOS il cursore di testo in un campo così stretto può oscurare il testo. | `.activity-edit-grid`, `@media (max-width: 560px)` | P1 | La regola `grid-template-columns: 1fr` scatta solo a ≤560 px. Tra 561 px e 920 px l'edit-grid rimane a 2 colonne. |
| `.activity-modal` ha `width: min(760px, 100%)`. A ≤560 px viene sovrascritto a `min(100%, calc(100vw - 3rem))`. Il `.modal-backdrop` ha `padding: 1rem 1.5rem` a ≤560 px. Il padding totale laterale è `1.5rem * 2 = 3rem`, lasciando `calc(100vw - 3rem)` per la modale: coerente. Ma il padding interno della modale è `1.75rem` (`.modal`), ridotto a `1.5rem` a ≤560 px. La modale ha `max-height: calc(100dvh - 2rem)` e `overflow-y: auto`: corretto per viewport basse. | `.activity-modal`, `.modal`, `.modal-backdrop` | P2 | Ben gestito. Nessun blocco funzionale. |
| `ActivityEditor` ha `DateTimeField` che emette `<input type="datetime-local">`. Su Android Chrome funziona. Su iOS Safari ≤16 il picker nativo è diverso e può risultare confuso perché il valore iniziale è già pre-compilato (`clientDateTimeValue()`). Non è un bug CSS ma un rischio di usabilità. | `DateTimeField`, `<input type="datetime-local">` | P2 | Richiede test manuale su iPhone. |
| `.activity-main` a ≤560 px diventa `flex-direction: column`. Il `<strong>` con la durata (es. "2h 30m") viene posizionato sotto il blocco testo invece che allineato a destra. Questo è intenzionale ma la durata perde il suo ruolo visivo di "metrica in evidenza" diventando testo inline. | `.activity-main`, `@media (max-width: 560px)` | P2 | Design choice accettabile. |

### Calendar

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.calendar-grid` usa `grid-template-columns: repeat(7, minmax(0, 1fr))` a larghezze > 920 px. A 920 px collassa a `grid-template-columns: 1fr` (singola colonna). `.calendar-day` ha `min-height: 150px` che viene azzerato a 920 px (`min-height: 0`). La griglia a 7 colonne su 768 px produce celle di circa `768 / 7 ≈ 110 px`. Le celle `.calendar-activity` hanno padding `0.36rem 0.42rem` e bordo, con testo `font-size: 0.78rem`. Le stringhe troncate (`white-space: nowrap; text-overflow: ellipsis`) funzionano, ma il target di tocco dell'intero `button.calendar-activity` è `min-height: 0` (il valore minimo implicito è `min-content`), spesso solo 30–35 px. | `.calendar-activity`, `.calendar-day` | P1 | I pulsanti `.calendar-activity` non hanno `min-height` esplicito. A 768 px con celle da 110 px, i bottoni risultano < 44 px di altezza su giornate con più eventi sovrapposti. |
| `.calendar-day-header strong` ha `white-space: nowrap`. Il testo della durata (es. "2h 30m") rimane su una sola riga. Con celle da 110 px e un numero del giorno più la durata, i due elementi potrebbero sovrapporsi se il numero del giorno è a 2 cifre (es. "28"). | `.calendar-day-header`, `.calendar-day-header strong` | P1 | `display: flex; justify-content: space-between` gestisce lo spazio ma non protegge da `min-width: 0` nel figlio flessibile: se la cella è troppo stretta, il numero può sovrapporre la durata. |
| Le azioni di navigazione calendar (Previous, Today, Next, Refresh) in `.calendar-actions` usano `display: flex; flex-wrap: wrap; justify-content: flex-end`. Su 360 px i 4 bottoni (min-height 40px, padding 0 16px) non stanno su una riga: il wrap funziona ma produce due righe di bottoni sopra la griglia, consumando spazio verticale. | `.calendar-actions` | P2 | Funzionale ma rumoroso. |

### Requests

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.request-card` è `display: flex; justify-content: space-between`. La colonna destra `.request-actions` ha `display: grid; justify-items: end`. A ≤560 px la regola `.request-card` diventa `flex-direction: column` e `.request-actions` diventa `justify-items: stretch`. I bottoni "Approve" e "Revoke" diventano full-width. Corretto. Ma tra 561 px e 920 px la card rimane orizzontale: se il testo nella parte sinistra (data/ora + note) è lungo, il layout si comprime. | `.request-card`, `.request-actions` | P1 | Tra 561–920 px `.request-actions` ha `justify-items: end` e i bottoni sono piccoli, non full-width. La colonna sinistra può troncare il testo `p.muted` senza `min-width: 0` sul contenitore sinistro `div`. |
| `.history-modal` ha `width: min(980px, 100%)` e `max-height: min(86vh, 920px)`. La modale è la più larga dell'applicazione. A ≤560 px viene ridefinita come `min(100%, calc(100vw - 3rem))`. Ma `RequestList` dentro la modale può avere molte card con testo lungo. Non c'è overflow orizzontale grazie ai flex wrapping, ma l'altezza `max-height: min(86vh, 920px)` con scroll interno funziona correttamente. | `.history-modal` | P2 | Nessun blocco. |
| `.history-filters` a ≤560 px diventa `flex-direction: column; align-items: stretch`. I campi Anno, Mese, Utente diventano stacked. A 560–920 px rimangono `flex-wrap: wrap` con `flex: 1 1 150px; min-width: min(150px, 100%)`. Su 390 px si ottengono 2 colonne da ~175 px: accettabile. | `.history-filters .field` | P2 | Nessun blocco. |

### Overtime

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.overtime-week` è `display: flex; justify-content: space-between`. A ≤560 px diventa `flex-direction: column`. La colonna destra `.overtime-week-stats` a desktop è `justify-items: end; text-align: right`; a mobile diventa `justify-items: start; text-align: left`. Il testo `strong` con il delta (es. "+2h 30m" o "-1h 15m") ha `border-radius` e `padding`: su mobile ha abbastanza spazio. | `.overtime-week`, `.overtime-week-stats` | P2 | Ben gestito. |
| `.overtime-setup` ha `max-width: 420px`. Su 360 px non c'è problema (max-width non entra in gioco). Il `TextField` per le ore target e il bottone primario occupano tutta la larghezza disponibile. | `.overtime-setup` | P2 | Nessun blocco. |
| I bottoni "Mark paid" nei `.overtime-week` quando la settimana è chiusa e l'overtime esiste non hanno classe specifica, usano il base `button`. Il `min-height: 40px` del base è sotto iOS HIG 44 px. | `button` in `.overtime-week-stats` | P1 | Tutti i bottoni generici hanno `min-height: 40px` (riga 93 CSS). iOS HIG raccomanda 44 px. Mancano 4 px. |

### Tags

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.tag-create-row` usa `grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto`. La terza colonna è `auto`, che per il bottone "Add tag" (`.primary-action`) corrisponde al contenuto. A ≤560 px la regola `grid-template-columns: 1fr` stacca tutto su colonne singole. Tra 561–920 px il layout 3 colonne può essere stretto su 430 px: la colonna colore (`1.2fr`) contiene `.color-control` con swatches (`flex-wrap: wrap`) e un input text. Su 430 px il layout regge. | `.tag-create-row` | P2 | Nessun blocco. |
| `.tag-list` usa `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))`. Su 360 px `minmax(260px, 1fr)` produce una colonna da 360 px (1fr), ma la minima è 260 px: corretto, si adatta. Su 430 px: una colonna da 430 px. Non c'è overflow. | `.tag-list` | P2 | Nessun blocco grazie a `minmax(0, 1fr)` implicito nella seconda parte. |
| I `.color-swatches button` hanno `width: 36px; height: 36px; min-height: 36px`. Sono 8px sotto l'iOS HIG target da 44 px. Elementi molto vicini tra loro (gap `0.45rem` = 7.2 px). | `.color-swatches button` | P1 | Touch target di 36 px con gap di 7 px: potenziale selezione errata del colore adiacente. |

### Tools (TimeTools)

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.time-tools-grid` usa `grid-template-columns: repeat(2, minmax(0, 1fr))`. A ≤560 px diventa `grid-template-columns: 1fr`. Tra 561–920 px rimane a 2 colonne. Ogni `.time-tool-card` contiene `.tool-row` con `display: flex; flex-wrap: wrap; gap: 0.4rem`. Dentro il "Target time" card: `TimeField` + label "+" + 2 input `.tool-num` (width 52px) + 2 span. Su 430 px in 2 colonne (colonna ~205 px), il `tool-row` va su più righe (wrap) in modo prevedibile. | `.time-tools-grid`, `.tool-row` | P2 | Nessun overflow, ma le tool card "Shift end" e "Target time" con molti elementi in `.tool-row` producono layout a 3–4 righe su colonne strette. |
| `.tool-num` ha `width: 52px` fisso. Questo non si adatta alla viewport. Su schermi piccoli è accettabile perché il contenuto (`0`–`99`) è breve, ma su iOS il picker numerico virtuale occupa 52 px e può essere scomodo. | `.tool-num` | P2 | Non causa overflow ma è un target piccolo. |
| `TimeField` emette `<input type="time">`. Su iOS Safari questo apre un drum-roller nativo. Il campo ha classe `.time-text-input` con `width: 100%` e `min-height: 46px` a ≤560 px (CSS riga 1719). Corretto. | `TimeField`, `<input type="time">` | P2 | Nessun blocco. |

### Countdowns

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.countdown-form` usa `grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto auto`. A 920 px collassa a `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` (2 colonne per i due elementi di testo, poi le due ultime colonne vanno a capo). A ≤560 px diventa `grid-template-columns: 1fr`. Ma tra 561–920 px, il layout a 2 colonne fa sì che la checkbox "Link to current session" e il bottone "Add countdown" finiscano in una seconda riga implicita del grid, ognuna occupando `minmax(0, 1fr)` (metà larghezza). Il bottone primario non è `width: 100%` in questo contesto, ma ha padding `0 1.5rem`. Accettabile. | `.countdown-form` | P2 | Il comportamento grid con 4 colonne dichiarate e 4 items su 2 righe implicite non è dichiarato esplicitamente: dipende dall'auto-placement. Funziona ma è fragile. |
| `.countdown-grid` usa `grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))`. A ≤560 px diventa `grid-template-columns: 1fr`. Tra 561 px e 760 px si ottengono 3 colonne (190*3=570 px): le card countdown sono strette (~180 px). Il `.countdown strong` con `font-size: 1.75rem` (timer HH:MM:SS) potrebbe essere troncato. | `.countdown-grid`, `.countdown strong` | P1 | `overflow-wrap: anywhere` non è impostato su `.countdown strong`. Se il timer è corto (es. "00:00:00" = 8 char * ~17px ≈ 136px) entra in una colonna da 180 px. Ma la stringa non ha spazi → `overflow-wrap: normal` non spezza → se le colonne sono più strette di 140 px c'è overflow del testo. Su 360 px a 1 colonna non c'è problema; su 390–560 px a 2 colonne (195 px) il monospace potrebbe toccare il bordo. |
| I bottoni "Done" e "Remove" in `.countdown-actions` hanno `flex-wrap: wrap` e `gap: 0.45rem`. A 190 px di colonna i bottoni (min-height 40px) stanno uno accanto all'altro se `padding: 0 16px` li contiene in ~90 px ciascuno. Su colonne da 190 px è borderline. | `.countdown-actions` | P2 | Nessun blocco certo, dipende dalla larghezza effettiva. |

### Profile / Settings

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.settings-grid` usa `grid-template-columns: repeat(2, minmax(0, 1fr))`. A 920 px collassa a 1 colonna. Non esiste un breakpoint intermedio: su 768 px rimane a 2 colonne (~360 px per colonna). Ogni `.panel.stack` contiene form e bottoni, che a 360 px per colonna funzionano. | `.settings-grid` | P2 | Nessun blocco. |
| `.csv-actions` usa `grid-template-columns: minmax(0, 1fr) auto auto`. A ≤560 px diventa `grid-template-columns: 1fr` per la regola `.tag-editor, .csv-actions { grid-template-columns: 1fr }`. Le tre celle (link download, label file-input, eventuale bottone extra) si stackano. Corretto. | `.csv-actions` | P2 | Nessun blocco. |
| `.codes` (recovery codes) usa `white-space: pre-wrap` e `overflow-x: auto`. I codici di recovery sono stringhe esadecimali lunghe (es. `a1b2c3d4e5f6...`). Se la singola stringa supera la larghezza del pannello, `overflow-x: auto` permette lo scroll orizzontale. Corretto. Ma `overflow-x: auto` su `.codes` non ha il supporto `-webkit-overflow-scrolling: touch`: lo scroll potrebbe non essere inerziale su iOS < 16. | `.codes` | P2 | Aggiungere `-webkit-overflow-scrolling: touch` o usare `overscroll-behavior: contain`. |
| La sezione "Password" in `ProfileSettings` mostra `PasswordHints` solo per il campo "New password": corretto. Il campo "Current password" non ha hints. Nessun problema di layout. | `PasswordHints`, `.password-hints` | P2 | Nessun blocco. |

### Admin

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.admin-grid` è `grid-template-columns: minmax(0, 1fr)` (1 colonna): corretto su tutti i viewport. A ≤560 px aggiunge `grid-template-columns: 1fr` ridondante ma innocuo. | `.admin-grid` | P2 | Nessun blocco. |
| `.admin-user-actions` è `display: flex; flex-wrap: wrap; gap: 0.45rem`. Può contenere fino a 7 bottoni per utente non-root (Edit user ID, Edit name/email, Disable edits, Enable/disable overtime, select overtime mode, Reset password, Delete). Su 360 px i bottoni wrappano su più righe, ogni bottone è almeno `min-height: 40px`. Corretto ma la sezione può diventare molto alta. | `.admin-user-actions` | P2 | Non è un problema di overflow ma di densità visiva: su 360 px una singola card utente può occupare 500+ px di altezza. |
| `.copy-id-button` ha `max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Questo bottone mostra il `publicId` dell'utente. In `.admin-user-header` il grid è `grid-template-columns: minmax(0, 1fr) auto`. La colonna `auto` per `.copy-id-button` rispetta `max-width: 240px`. Su 360 px la colonna `auto` può sottrarre fino a 240 px alla prima colonna, lasciando ~105 px per `.admin-user-select`. Lo `strong` dentro (username) potrebbe troncarsi. | `.copy-id-button`, `.admin-user-header` | P1 | `.admin-user-select` non ha `min-width: 0` esplicito e la colonna `minmax(0, 1fr)` garantisce che si restringa, ma il username in `<strong>` dentro il bottone non ha `overflow: hidden; text-overflow: ellipsis` → può uscire dal flex container. |

### Audit Log

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.audit-table-wrap` ha `overflow-x: auto; -webkit-overflow-scrolling: touch`. La tabella `.audit-table` ha `white-space: nowrap` su tutto. Questo è il pattern corretto per tabelle su mobile. La larghezza minima effettiva della tabella con 6 colonne (Date/Time, Actor, Target, Event, IP, Details) su 360 px è ~600+ px. Lo scroll orizzontale funziona. | `.audit-table-wrap`, `.audit-table` | P2 | Nessun blocco funzionale. |
| `.audit-filter-bar` è `display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end`. Contiene 5 field (`.audit-filter-field` con `flex: 1 1 160px; min-width: 0`) più `.audit-filter-actions`. Su 360 px 2 field per riga (160+160=320px < 360px). `.audit-filter-actions` (bottoni Search e Reset) ha `flex: 0 0 auto`. Può finire solo su una riga. Nessun blocco funzionale ma la larghezza della sezione filter può essere caotica su 360 px. | `.audit-filter-bar`, `.audit-filter-field` | P2 | Nessun blocco. |
| Il bottone "Download PDF" e "Export CSV" nel `panel-title` dell'AuditLogView occupano la stessa riga con `display: flex; justify-content: space-between`. Con 3 elementi nell'header (div titolo + 2 bottoni) il `.panel-title` usa `flex-wrap: wrap`, quindi su viewport stretto i bottoni possono andare a capo. | `.panel-title` nell'AuditLogView | P2 | `.panel-title` a ≤560 px diventa `flex-direction: column; align-items: stretch`. I bottoni diventano full-width. Corretto. |

### Punch Dialog

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `PunchDialog` mostra `DateTimeField` con il valore corrente precompilato (`clientDateTimeValue()`). Su iOS il campo `datetime-local` apre il picker nativo. L'utente può modificare il tempo prima di confermare: il requisito "editable client time before submission" è soddisfatto. | `DateTimeField` in `PunchDialog` | P2 | Conforme al requisito UX. |
| `.slide-confirm` ha `min-height: 68px` e il thumb ha `width: 66px; height: 66px`. Su 360 px la larghezza della track è `calc(360px - 2*1rem - 2*1.75rem) ≈ 282px` nel modal. Il thumb è 66 px. L'area utile di sliding è 282 - 66 = 216 px. Il threshold è al 96%: l'utente deve portare il pollice a 207 px dal bordo sinistro. Fattibile con una sola mano su 360 px. | `.slide-confirm`, `.slide-confirm-thumb` | P2 | Nessun blocco funzionale. |
| La `.tag-picker` dentro il punch dialog usa `display: flex; flex-wrap: wrap; gap: 0.5rem`. Ogni label ha `padding: 5px 12px`. Nessuna label ha `min-height` esplicito: l'altezza effettiva dipende dal font (≈ 0.875rem * 1.5 + 10px ≈ 31 px). Sotto iOS HIG 44 px. | `.tag-picker label` | P1 | I tag picker label hanno altezza effettiva ~31 px, 13 px sotto i 44 px raccomandati. Con più tag vicini, il rischio di tocco errato è concreto. |

### Critical Dialog

| Problema | Classe/elemento | Priorità | Note |
|---|---|---|---|
| `.critical-modal` ha `width: min(460px, 100%)` e `border-radius: 28px`. `.modal-actions` a ≤560 px diventa `flex-direction: column-reverse; align-items: stretch`, rendendo i bottoni full-width. Corretto. | `.critical-modal`, `.modal-actions` | P2 | Nessun blocco. |
| Il `.modal-backdrop` ha `padding: 1rem` (globale) e `padding: 1rem 1.5rem` a ≤560 px. Il padding laterale di 1.5rem * 2 = 3rem lascia `calc(100vw - 3rem)` per il dialog. Su 360 px = 307 px. Il dialog con `min(460px, 100%)` si adatta a 307 px. Corretto. | `.critical-backdrop`, `.modal-backdrop` | P2 | Nessun blocco. |

---

## 3. Checklist test manuale

| Viewport | Vista | Cosa testare | Esito atteso |
|---|---|---|---|
| 360px | Auth | Scorrere il tab switcher (Sign in / Register / Passkey / Recovery): nessun tab viene troncato o nascosto | I 4 tab sono tutti visibili e toccabili in orizzontale con scroll |
| 360px | Auth | Completare la registrazione con password di 8 char: i `PasswordHints` appaiono live sotto il campo | Hints mostrano ✓ verde / ✗ rosso per ogni criterio mentre si digita |
| 360px | Dashboard | Aprire la sezione nav (11 voci) e scorrere orizzontalmente | Tutti i bottoni nav sono accessibili con scroll, nessuna voce nascosta |
| 360px | Dashboard | Vedere la quarta metric "Presence / smart" con valori reali | Il testo va a capo (`overflow-wrap: anywhere`) senza uscire dal bordo |
| 360px | Activities | Aprire il `week-tabs` con 6+ settimane | Verificare se i tab wrappano in verticale (bug P0) invece di scrollare |
| 360px | Tags | Toccare i `.color-swatches button` (36×36 px) | Verificare che la selezione colore non colpisca il bottone adiacente |
| 360px | Countdowns | Aprire la vista con 4+ countdown in `.countdown-grid` | I timer monospace non escono dal bordo delle celle a 1 colonna |
| 360px | Admin | Espandere un utente admin con 5+ bottoni in `.admin-user-actions` | Tutti i bottoni sono visibili e toccabili, la card si espande in altezza |
| 360px | Audit log | Aprire la tabella con dati | La tabella ha scroll orizzontale, non produce overflow del body |
| 390px | Auth | Aprire il form di recupero account: tutti i campi (Username, New password, Recovery code, TOTP code) sono visibili senza scroll laterale | Nessun overflow orizzontale |
| 390px | Dashboard | Verificare la `work-band` con sessione attiva e orario lungo (es. italiano: "Avviato il 23/05/2026, 09:30:00") | Il testo non sovrasta il bottone clock-out |
| 390px | Calendar | Toccare un evento `.calendar-activity` in una cella con 3 eventi sovrapposti | Ogni bottone è toccabile senza attivare quello sopra o sotto |
| 390px | Requests | Aprire la modale history con filtri applicati | I campi Anno, Mese, Utente sono su 2 righe e toccabili |
| 390px | Punch dialog | Modificare il campo datetime prima di fare slide | L'input datetime-local apre il picker nativo e il valore rimane modificabile |
| 390px | Punch dialog | Selezionare un tag dal `.tag-picker` con 4+ tag | Ogni label è toccabile senza colpire quella adiacente (target ~31 px) |
| 430px | Activities | Aprire l'editor dell'attività con 4 campi date/timezone | I 4 campi in `.activity-edit-grid` (2 colonne a 430 px) hanno larghezza ≥ 190 px ciascuno |
| 430px | Tools | Usare il tool "Shift end": toccare i 2 `input[type=number].tool-num` (52 px fisso) | I numeri sono modificabili senza lo zoom automatico (font-size ≥ 16px verificato) |
| 430px | Profile | Scorrere la sezione "CSV export and restore" con la `.file-input` | L'area di upload è visibile e toccabile, non produce overflow |
| 430px | Admin | Aprire il punch dialog come admin e usare lo `SlideToConfirm` | Il pollice arriva al 96% della track con un singolo gesto |
| 768px | Dashboard | Verificare il `.chart-grid` a 3 colonne | Ogni grafico ha le label visibili senza troncatura |
| 768px | Calendar | Verificare la griglia 7-colonne con giorni pieni | Le celle hanno altezza sufficiente per mostrare 2–3 attività |
| 768px | Audit log | Usare i filtri "From" e "To" con `input[type=date]` | Il date picker nativo si apre correttamente e il valore si salva |
| 768px | Settings | Verificare `.settings-grid` a 2 colonne | Le due colonne non producono overflow del pannello più largo |
| 768px | Requests | Aprire `.history-modal` (max-width 980px) | La modale non supera il viewport, ha scroll interno se il contenuto è lungo |

---

## 4. Classi CSS esistenti da riusare

| Classe | Cosa fa | Dove applicarla |
|---|---|---|
| `overflow-wrap: anywhere` già su `.metric strong` | Spezza le parole lunghe senza overflow | Aggiungere a `.countdown strong` per evitare overflow del timer monospace in colonne strette |
| `min-width: 0` già su `.time-field`, `.calendar-activity div`, `.admin-user-header` colonna 1 | Permette ai flex/grid item di restringersi sotto il contenuto minimo | Aggiungere all'elemento `div` sinistro dentro `.request-card` per proteggere da testo lungo |
| `flex-wrap: nowrap` già su `.tabs, .section-nav` a `@media (max-width: 560px)` con `overflow-x: auto` | Crea scroll orizzontale invece di wrap verticale | Applicare a `.week-tabs` per correggere il bug P0 (attualmente ha `flex-wrap: wrap`) |
| `scrollbar-width: none` già su `.ios-day-strip, .ios-wheel` | Nasconde la scrollbar nativa mantenendo la funzionalità scroll | Aggiungere a `.week-tabs` quando si applica `flex-wrap: nowrap; overflow-x: auto` |
| `scroll-snap-type: x proximity` già su `.ios-day-strip` | Snap magnetico sullo scroll orizzontale | Aggiungere a `.week-tabs` per migliorare la navigazione tra settimane |
| `min-height: 44px` già su `.primary-action`, `.clock-action`, `.toggle-row` | Garantisce il target iOS HIG | Aggiungere ai bottoni `.overtime-week-stats button` (attualmente `min-height` base = 40 px) |
| `-webkit-overflow-scrolling: touch` già su `.audit-table-wrap`, `.ios-day-strip` | Scroll inerziale su iOS | Aggiungere a `.codes` (pre dei recovery codes) |
| `.wide` (`grid-column: 1 / -1`) già usato in `ProfileSettings` e `TimeTools` | Occupa tutta la larghezza del grid genitore | Può essere usato per il pannello history della request-grid se si vuole forzare full-width |
| `flex: 0 0 auto` già sui `.tabs button` e `.section-nav button` a `@media (max-width: 560px)` | Impedisce il restringimento dei tab | Aggiungere ai bottoni di `.week-tabs` insieme a `flex-wrap: nowrap` |
| `font-size: 16px` su `.field input` a `@media (max-width: 560px)` (riga 1721) | Previene autozoom su iOS Safari | Già applicato a tutti i field. Verificare che `.countdown-form DateTimeField` sia coperto (lo è: usa `.field input`). |

---

## 5. Riepilogo priorità

### Conteggio totale

| Priorità | Conteggio |
|---|---|
| P0 | 1 |
| P1 | 9 |
| P2 | 26 |

### P0 da risolvere per primi

1. **`.week-tabs` — `flex-wrap: wrap` con `overflow-x: auto`** (Activities): quando ci sono 6+ settimane, i tab wrappano verticalmente invece di scorrere orizzontalmente. La correzione chirurgica è sostituire `flex-wrap: wrap` con `flex-wrap: nowrap` in `.week-tabs` e aggiungere `overflow-x: auto; scrollbar-width: none;`. I bottoni `flex: 0 0 auto` evitano che si restringano. Una sola modifica di 3 proprietà CSS.

### P1 ordinati per impatto

1. **`.tag-picker label` — touch target ~31 px** (Punch dialog, Activity editor): le label checkbox per i tag nelle viste critiche (punch in/out) sono sotto i 44 px iOS HIG. Aggiungere `min-height: 44px` a `.tag-picker label`.
2. **`.week-tabs` — visibilità implicita dello scroll** (Activities): dopo il fix P0, nessun indicatore visivo segnala all'utente che la nav è scrollabile. Aggiungere un `mask-image: linear-gradient(to right, black 90%, transparent)` al contenitore.
3. **`.section-nav` — 11 bottoni senza hint di scroll** (Dashboard): stesso problema della nav principale. Un fade hint ai bordi migliora la discoverability.
4. **`.activity-edit-grid` — campi timezone stretti tra 561 e 920 px**: i campi "Start timezone" e "End timezone" a 2 colonne su viewport intermedie sono poco usabili.
5. **`.calendar-activity` — touch target sotto 44 px**: i bottoni in celle calendar da 110 px su 768 px hanno altezza variabile, spesso < 44 px. Aggiungere `min-height: 44px` a `.calendar-activity`.
6. **`.calendar-day-header` — sovrapposizione numero/durata**: aggiungere `min-width: 0` al figlio flessibile `strong` per garantire che il testo durata non sovrapponga il numero del giorno.
7. **`.request-card div` sinistra senza `min-width: 0`**: il testo data/ora può uscire dal flex container. Aggiungere `min-width: 0` al primo `div` figlio di `.request-card`.
8. **`.admin-user-select strong` — username troncato**: aggiungere `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` al `strong` dentro `.admin-user-select`.
9. **`button` in `.overtime-week-stats` — `min-height: 40px`**: 4 px sotto iOS HIG. Aggiungere una regola `.overtime-week-stats button { min-height: 44px }`.
