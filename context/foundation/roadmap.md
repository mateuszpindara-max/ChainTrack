---
project: ChainTrack
version: 1
status: draft
created: 2026-09-28
updated: 2026-10-16
prd_version: 2
main_goal: speed
top_blocker: external
milestone_id: first-activity-and-chain-tracking
milestone_seq: 1
milestone_status: open
---

# Roadmap: ChainTrack

> Derived from `context/foundation/prd.md` (v2), supporting project decisions, and the confirmed codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Import aktywności i śledzenie łańcuchów** — Status: open

- **Intent:** Użytkownik pobiera aktywności przypisane do rowerów, a następnie może utworzyć łańcuch, przypisać go do aktywności i oznaczyć woskowanie. Ręczna aktualizacja i filtrowanie domykają podstawowy przepływ.
- **Source materials:** `context/foundation/prd.md` (v2); `context/foundation/shape-notes.md` (rozstrzygnięte decyzje); `context/foundation/tech-stack.md` (wybory użyte w baseline).
- **Done when:** wszystkie elementy S-01–S-05 mają status `done`.
- **Scope anchors:** FR-001–FR-008, US-01.

## Vision recap

Właściciel wielu rowerów ma trudność z pamiętaniem, ile kilometrów przejechał na danym łańcuchu od ostatniego woskowania, i może zauważyć problem dopiero podczas długiej jazdy. Aplikacja ma obliczać przebieg między woskowaniami, aby użytkownik mógł określić własny próg i przewidywać kolejne woskowanie, zanim łańcuch zacznie hałasować.

## North star

**S-01: Użytkownik widzi aktywności przypisane do rowerów.** To pierwszy sprawdzian wybrany przez użytkownika; odsłania ryzyko importu, zanim dojdą funkcje śledzenia łańcucha.

> Gwiazda przewodnia oznacza najmniejszy kompletny przepływ, którego dostarczenie pokaże, że kluczowa część produktu działa; umieszczamy go możliwie wcześnie, bo pozostałe funkcje zależą od jego powodzenia.

## At a glance

| ID   | Change ID                     | Outcome (user can …)                                            | Prerequisites | PRD refs                              | Status   |
| ---- | ----------------------------- | --------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| S-01 | import-bike-linked-activities | importować i przeglądać nazwę, dystans, datę i rower aktywności | —             | FR-001, FR-002                        | done |
| S-02 | refresh-activities-safely     | ręcznie importować nowe wpisy niezależnie od daty albo naprawiać całą historię; ukrywać niedopasowane i usuwać skasowane wraz z danymi zależnymi po pełnej weryfikacji, bez duplikatów | S-01          | FR-003                                | in-progress |
| S-03 | create-chain                  | tworzyć własny łańcuch                                          | —             | FR-004                                | ready    |
| S-04 | assign-chain-and-mark-waxing  | przypisać łańcuch do aktywności i oznaczyć woskowanie           | S-01, S-03    | US-01, FR-005, FR-006, Access Control | proposed |
| S-05 | filter-activities             | filtrować aktywności po rowerze i łańcuchu                      | S-01, S-04    | FR-007, FR-008                        | proposed |

## Streams

Nawigacja po powiązanych zależnościach. Kanoniczna kolejność pozostaje w grafie zależności poniżej.

| Stream | Theme                | Chain                    | Note                                                                 |
| ------ | -------------------- | ------------------------ | -------------------------------------------------------------------- |
| A      | Import aktywności    | `S-01` → `S-02`          | Najpierw odsłania ryzyko zewnętrznego importu.                       |
| B      | Przypisanie łańcucha | `S-03` → `S-04` → `S-05` | Dołącza do strumienia A w `S-04`, korzystając z aktywności z `S-01`. |

## Baseline

Stan kodu na `2026-09-28`, z potwierdzeniem użytkownika. Dane opisujemy zgodnie z wyborem Supabase.

- **Frontend:** present — Astro SSR i React zgodnie z `tech-stack.md`; skonfigurowane w `astro.config.mjs`.
- **Backend / API:** partial — SSR i endpointy uwierzytelniania istnieją; logika źródła aktywności jeszcze nie istnieje.
- **Data:** partial — Supabase jest używany przy uwierzytelnianiu; dane aktywności i łańcuchów nie są jeszcze wdrożone.
- **Auth:** present — Supabase SSR oraz ochrona `/dashboard` w `src/middleware.ts`.
- **Deploy / infra:** present — Cloudflare Workers i konfiguracja CI istnieją w repozytorium.
- **Observability:** partial — obserwowalność Workers jest włączona; osobne śledzenie błędów i metryk nie zostało wykazane.

## Foundations

Brak osobnych fundamentów. Uwierzytelnianie i wdrożenie są już obecne; minimalna obsługa danych pojawi się w pierwszych pionowych funkcjach, które jej potrzebują.

## Slices

### S-01: Import i przegląd aktywności

- **Outcome:** Użytkownik może pobrać dostępną historię aktywności z nazwą, dystansem, datą i przypisanym rowerem oraz przeglądać ją od najnowszej do najstarszej; aktywności bez jednoznacznego roweru są pomijane z informacją dla użytkownika.
- **Change ID:** `import-bike-linked-activities`
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** S-03
- **Blockers:** Potwierdzenie dostępu do usługi Strava i danych aplikacji potrzebnych do połączenia.
- **Unknowns:**
  - Czy dostęp do Strava i wymagane dane aplikacji są gotowe do użycia? — Owner: user. Block: yes.
- **Risk:** Bez działającego dostępu do źródła aktywności nie da się zweryfikować najważniejszej zależności całego przepływu.
- **Status:** done

### S-02: Ręczna aktualizacja aktywności

- **Outcome:** Użytkownik może ręcznie importować aktywności nowo widoczne w Stravie niezależnie od daty jazdy albo naprawić całą historię, odświeżając obecnie zapisywane pola i przypisania roweru. Naprawa zachowuje, ale ukrywa aktywności nadal obecne bez jednoznacznego roweru; aktywności skasowane w Stravie usuwa fizycznie wraz z danymi zależnymi dopiero po pełnym, zweryfikowanym przebiegu, bez duplikatów.
- **Change ID:** `refresh-activities-safely`
- **PRD refs:** FR-003
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niejasny wynik błędnej aktualizacji lub powielone wpisy podważą zaufanie do danych.
- **Status:** in-progress

### S-03: Tworzenie łańcucha

- **Outcome:** Użytkownik może utworzyć własny łańcuch, który będzie można przypisać do aktywności.
- **Change ID:** `create-chain`
- **PRD refs:** FR-004
- **Prerequisites:** —
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To niezależny, niewielki krok, który odblokowuje przypisywanie bez czekania na zakończenie importu.
- **Status:** ready

### S-04: Przypisanie łańcucha i oznaczenie woskowania

- **Outcome:** Użytkownik może przypisać utworzony łańcuch do aktywności i zapisać, że na jej końcu wykonał woskowanie.
- **Change ID:** `assign-chain-and-mark-waxing`
- **PRD refs:** US-01, FR-005, FR-006, Access Control
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Błędne powiązanie łańcucha lub woskowania z aktywnością uniemożliwi wiarygodne śledzenie przebiegu.
- **Status:** proposed

### S-05: Filtrowanie aktywności

- **Outcome:** Użytkownik może zawęzić listę aktywności do wybranego roweru lub łańcucha.
- **Change ID:** `filter-activities`
- **PRD refs:** FR-007, FR-008
- **Prerequisites:** S-01, S-04
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Filtry muszą uwzględniać zapisane przypisania, aby nie ukrywać aktywności w sposób mylący.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                    | Ready for `/10x-plan` | Notes                                       |
| ---------- | ------------------------------- | ---------------------------------------- | --------------------- | ------------------------------------------- |
| S-01       | `import-bike-linked-activities` | Import and browse bike-linked activities | no                    | Confirm Strava access and application data. |
| S-02       | `refresh-activities-safely`     | Refresh activities without duplicates    | no                    | Requires S-01.                              |
| S-03       | `create-chain`                  | Create a chain                           | yes                   | Run `/10x-plan create-chain`.               |
| S-04       | `assign-chain-and-mark-waxing`  | Assign chains and record waxing          | no                    | Requires S-01 and S-03.                     |
| S-05       | `filter-activities`             | Filter activities by bike and chain      | no                    | Requires S-01 and S-04.                     |

## Open Roadmap Questions

Brak pytań przekrojowych. Potwierdzenie dostępu do Strava blokujące `S-01` znajduje się w tej pozycji, a nie w pytaniach obejmujących cały milestone.

## Parked

- **Automatyczne przypisywanie łańcucha do aktywności** — poza MVP; przypisania pozostają ręczne.
- **Metryki łańcucha: liczba woskowań, średni i bieżący przebieg** — poza MVP według PRD.
- **Synchronizacja aktywności w tle** — poza MVP; odświeżenie jest uruchamiane ręcznie.
- **Obsługa wielu użytkowników i role administratora** — poza MVP; zakres obejmuje jednego użytkownika z dostępem do własnych danych.

## Milestone History

## Done

- **S-01: Użytkownik widzi aktywności przypisane do rowerów.** — Archived 2026-10-16 → `context/archive/2026-09-28-import-bike-linked-activities/`. Lesson: —.
