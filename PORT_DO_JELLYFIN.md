# Analiza przeniesienia wtyczki `playback_reporting` z Emby do Jellyfin 10.11 / 12.x

> Dokument analityczny. Stan na podstawie kodu w repo, źródła Jellyfin (branch `epg-matching-12z`, ~12.x),
> `jellyfin-web` oraz referencyjnej wtyczki `jellyfin-plugin-napi`.
> Główny nacisk: **Jellyfin 12.x (net10.0)**. Cel dodatkowy: możliwość instalacji z własnego repozytorium
> wtyczek Jellyfin (manifest.json), wzorowanego na `jellyfin-plugin-napi`.

---

## 1. Podsumowanie (TL;DR)

- Wtyczka jest napisana pod **stary stos Emby/ServiceStack** i pod **API Emby 4.8** (`mediabrowser.server.core`),
  target `netstandard2.0`. W obecnej postaci **nie skompiluje się ani nie uruchomi** na Jellyfin 10.11 ani 12.x.
- Największe blokery to warstwy, których w Jellyfin **nie ma wcale**:
  - REST API w stylu ServiceStack (`IService`, `[Route]`, `IReturn`, `IRequiresRequest`, `[Authenticated]`, `[ApiMember]`),
  - `IServerEntryPoint` (usunięte; w 12.x zastąpione przez `IHostedService`),
  - system notyfikacji (`Emby.Notifications`, `INotificationTypeFactory`, `INotificationService`) — **Jellyfin 12 nie ma
    rozszerzalnych typów powiadomień**,
  - `MediaBrowser.Model.Logging` (`ILogManager`/`ILogger`) → `Microsoft.Extensions.Logging`,
  - identyfikatory całkowite `BaseItem.InternalId` — **w Jellyfin 12 nie istnieje na `BaseItem`**; Jellyfin używa `Guid`.
- Istnieje **oficjalny port tej samej wtyczki** (`jellyfin/jellyfin-plugin-playbackreporting`, target `net10.0`,
  Jellyfin 12). To najlepszy wzorzec docelowej architektury — jest pochodną tego samego kodu Emby.
- Rekomendacja: **port docelowo na 12.x (`net10.0`)**, opcjonalnie druga nogawka `net9.0` dla 10.11 z dyrektywami
  `#if NET10_0` (`IScheduledTask` zmieniło sygnaturę, `IServerEntryPoint` nie istnieje w 12).
- Instalacja z własnego repo jest w pełni wykonalna: `manifest.json` + `build.sh` + workflow (wzór: `jellyfin-plugin-napi`).
  **GUID wtyczki musi pozostać spójny** (`9E6EB40F-9A1A-4CA1-A299-62B4D252453E`) i nie może kolidować z oficjalną
  wtyczką Jellyfin (`5c534381-91a3-43cb-907a-35aa02eb9d2c`).

---

## 2. Stan obecny (Emby)

| Element | Wartość |
| --- | --- |
| Target | `netstandard2.0` |
| Pakiety | `mediabrowser.server.core 4.8.0.27-beta`, `SQLitePCL.pretty.core 1.2.2`, `System.Memory 4.5.5` |
| GUID | `9E6EB40F-9A1A-4CA1-A299-62B4D252453E` |
| Warstwa REST | ServiceStack (`Api/UserActivityAPI.cs`) |
| Wejście serwera | `IServerEntryPoint` (`EventMonitorEntryPoint`) |
| Baza | SQLitePCL.pretty, plik `playback_reporting.db` |
| UI | `IHasWebPages` + `Pages/*.html` + `Pages/*.js` (AMD `define` + `pluginManager`) |
| Notyfikacje | `Emby.Notifications.INotificationTypeFactory` |
| Konfiguracja | `IConfigurationFactory` (`ReportPlaybackOptions`) + `PluginConfiguration` |

### Pliki i rola

- `Plugin.cs` — `BasePlugin<PluginConfiguration>`, `IHasWebPages`, `IHasThumbImage`.
- `EventMonitorEntryPoint.cs` — nasłuch `ISessionManager.PlaybackStart/PlaybackStopped`, zapis do DB.
- `Api/UserActivityAPI.cs` — ~20 endpointów ServiceStack pod `/user_usage_stats/...`.
- `Data/ActivityRepository.cs` — singleton, cały SQL, eksport/import, custom query.
- `Data/{PlaybackInfo,PathItem,ItemInfo,ItemChildStats}.cs` — modele (uwaga: `long Id`, `BaseItem.InternalId`).
- `BackupManager.cs`, `Extensions.cs`, `Notifications.cs`, `PluginConfiguration.cs`, `ReportPlaybackOptions.cs`.
- `Tasks/Task*.cs` — 5 zadań cyklicznych (`IScheduledTask`).
- `Pages/*` — 9 raportów (HTML + JS), `chart.min.js`, `helper_function.js`.

---

## 3. Docelowe API Jellyfin — zweryfikowane fakty

Weryfikacja na źródle Jellyfin 12 (`c:\sources\jellyfin`) i `jellyfin-web`:

| Emby (obecnie) | Jellyfin 12.x | Status |
| --- | --- | --- |
| `IService` / `[Route]` / `IReturn` / `IRequiresRequest` / `[Authenticated]` / `[ApiMember]` | `ControllerBase`, `[ApiController]`, `[Route]`, `[HttpGet/Post]`, `[Authorize(Policy = Policies.RequiresElevation)]` | **Przepisać** |
| `IServerEntryPoint` (`Run`, `Dispose`) | `IHostedService` (`StartAsync`/`StopAsync`) rejestrowany przez `IPluginServiceRegistrator.AddHostedService<T>()` | **Przepisać** |
| `MediaBrowser.Model.Logging.ILogManager` / `ILogger` | `Microsoft.Extensions.Logging.ILogger<T>` / `ILoggerFactory` | **Wymienić** |
| `MediaBrowser.Model.Serialization.IXmlSerializer` (w Plugin) | `IXmlSerializer` **nadal istnieje** (base ctor) | OK |
| `IJsonSerializer` | nieużywany / System.Text.Json | Usunąć |
| `BaseItem.InternalId`, `IsResolvedToFolder` | **nie istnieje**; używać `BaseItem.Id` (`Guid`) | **Przepisać** |
| `IsTopParent`, `GetTopParent()`, `GetParent()` | **istnieją** | OK |
| `ILibraryManager.GetItemById(long)` | `GetItemById(Guid)` | Zmienić typ |
| `IUserManager.GetUserList(UserQuery)` | `IUserManager.GetUsers()` → `IEnumerable<Jellyfin.Database.Implementations.Entities.User>` | Zmienić |
| `IUserDataManager.GetUserData(User, BaseItem)` | istnieje; `User` = `Jellyfin.Database.Implementations.Entities.User` | Zmienić typ |
| `IConfigurationFactory` + `ConfigurationStore` + `GetConfiguration<T>` | **istnieją** (`MediaBrowser.Common.Configuration`) | OK |
| `INotificationTypeFactory` / `Emby.Notifications` / `INotificationService` | **nie istnieją** (tylko enum `MediaBrowser.Model.Notifications.NotificationType`) | **Usunąć funkcję** |
| `IScheduledTask.Execute(CancellationToken, IProgress<double>)` | **12.x: `ExecuteAsync(IProgress<double>, CancellationToken)`** | **#if NET10_0** |
| `TaskTriggerInfo.TriggerDaily` (string) | `TaskTriggerInfo.Type` = `TaskTriggerInfoType.Daily` (enum) | Zmienić |
| `IPlaylistManager.CreatePlaylist(PlaylistCreationRequest)` | istnieje; `ItemIdList` = `IReadOnlyList<Guid>` | Zmienić `long`→`Guid` |
| `IActivityManager` (`MediaBrowser.Model.Activity`) | istnieje (`CreateAsync(ActivityLog)`) | OK |
| `IHasThumbImage` | **nie istnieje**; obraz wtyczki z `imageUrl` w repo/manifest | Zastąpić |
| `SQLitePCL.pretty.core 1.2.2` (Emby) | `SQLitePCL.pretty.netstandard 3.1.0` (oficjalny port tak używa) | Zmienić pakiet |
| `IHasWebPages` / `PluginPageInfo` | **istnieje**; `EnableInMainMenu`, `DisplayName`, `MenuIcon` | OK |

### UI / zakładka w kokpicie

- `PluginPageInfo.EnableInMainMenu = true` → wpis pojawia się w szufladzie Dashboardu w sekcji **Plugins**
  (potwierdzone w `jellyfin-web/src/apps/dashboard/components/drawer/sections/PluginDrawerSection.tsx`).
- Strony serwowane przez `GET /web/ConfigurationPage?name=<Name>` (jedna strona = jeden `PluginPageInfo`).
- Format strony w Jellyfin 12 to **pojedynczy HTML z inline `<script>`** używający globalnych `ApiClient`,
  `Dashboard` (wzór: `MediaBrowser.Providers/Plugins/ListenBrainz/Configuration/config.html`).
- **Nie ma już** wsparcia dla wzorca `define([...], function(...) { pluginManager.definePlugin({...}) })`
  ani `viewManager`. Stare `Pages/*.js` trzeba przepisać na inline-skrypt w HTML.
- Konfiguracja: zamiast `getNamedConfiguration('playback_reporting')` można nadal używać rejestru config store
  (`IConfigurationFactory`) lub przełączyć się na `ApiClient.getPluginConfiguration(<guid>)` /
  `updatePluginConfiguration` (jak w bundled plugins). Rejestr `IConfigurationFactory` istnieje w 12, więc
  wariant „named configuration" też zadziała.

---

## 4. Mapa migracji plik → plik

Wzorzec docelowy: struktura oficjalnego portu Jellyfin (`Jellyfin.Plugin.PlaybackReporting`, namespace
`Jellyfin.Plugin.PlaybackReporting`).

| Obecny plik (Emby) | Docelowo (Jellyfin 12) | Zakres zmian |
| --- | --- | --- |
| `Plugin.cs` | `Plugin.cs` | Namespace, usunięcie `IHasThumbImage`, `IHasWebPages` bez zmian, guid, `Instance` |
| `EventMonitorEntryPoint.cs` | `EventMonitorEntryPoint.cs` | `IServerEntryPoint` → `IHostedService`; `ILogger<T>`; subskrypcja `PlaybackProgress`; `e.Users[0].Id`; filtr theme media; (opcjonalnie) wydzielenie `PlaybackTracker` |
| — | **`PluginServiceRegistrator.cs`** | Nowy: `AddHostedService<EventMonitorEntryPoint>()` |
| `Api/UserActivityAPI.cs` | `Api/PlaybackReportingActivityController.cs` | Pełne przepisanie na MVC; `[Route("user_usage_stats")]`, `[Authorize(Policy = Policies.RequiresElevation)]`, `Ok(...)` |
| `Data/ActivityRepository.cs` | `Data/ActivityRepository.cs` + `IActivityRepository`, `BaseSqliteRepository`, `ManagedConnection`, `SqliteExtensions` | Pakiet SQLite, `ILogger<T>`, `ItemId` jako `Guid("N")`, rozbicie na warstwy |
| `Data/PlaybackInfo.cs` | `Data/PlaybackInfo.cs` | Bez zmian modelu (opcjonalnie ctor) |
| `Data/PathItem.cs`, `ItemInfo.cs`, `ItemChildStats.cs` | `Model/*` | `long Id` → `Guid`; `ItemChildStats` na `User` z EF |
| `BackupManager.cs` | `BackupManager.cs` | `ILoggerFactory` zamiast `ILogger` |
| `Extensions.cs` | `Extensions.cs` | Bez zmian (factory config działa w 12) |
| `Notifications.cs` | **usunąć** | Brak odpowiednika w Jellyfin |
| `PluginConfiguration.cs` | `Configuration/PluginConfiguration.cs` | Bez zmian |
| `ReportPlaybackOptions.cs` | `Model/ReportPlaybackOptions.cs` | Bez zmian |
| `Tasks/TaskCleanDb.cs`, `TaskRunBackup.cs` | `TaskCleanDb.cs`, `TaskRunBackup.cs` | `ExecuteAsync`, `ILogger<T>`, enum triggera |
| `Tasks/TaskCreatePlaylists.cs` | `TaskCreatePlaylists.cs` | `long`→`Guid` dla `ItemIdList`, nowe `DeleteOptions` |
| `Tasks/TaskNotifiction*.cs` | **usunąć / przepisać na wpisy Activity Log** | Brak systemu notyfikacji |
| `Pages/*` | `Pages/*` | Przepisać HTML/JS na format Jellyfin (inline script), `Chart.bundle.min.js` |
| `playback_reporting.csproj` | `Jellyfin.Plugin.PlaybackReporting.csproj` | Pakiety Jellyfin, `FrameworkReference Microsoft.AspNetCore.App`, `SQLitePCL.pretty.netstandard` |

---

## 5. Warstwa repozytorium wtyczek (wzór: `jellyfin-plugin-napi`)

Aby instalować z własnego repo, potrzebne są (skopiować wzorzec z `c:\sources\jellyfin-plugin-napi`):

1. **`manifest.json`** w katalogu głównym repo — tablica pakietów:
   - `guid` **musi** = `Plugin.Id` (`9E6EB40F-9A1A-4CA1-A299-62B4D252453E`),
   - `name` = "Playback Reporting", `category` np. "Administration", `owner` = Twój GitHub,
   - `versions[].targetAbi` = **minimalna** wersja serwera (`12.0.0.0`),
   - `versions[].checksum` = **MD5 pliku zip**,
   - `versions[].sourceUrl` = URL wydania GitHub z zipem.
2. **`build.sh`** — buduje wskazany TFM, pakuje zip (DLL wtyczki w katalogu głównym archiwum) i wypisuje wpis manifestu.
   - Uwaga: oficjalny port dokłada do `artifacts` także `SQLitePCL.pretty.dll` → **zip musi zawierać zależności**
     (w przeciwieństwie do `napi`, które pakuje tylko własną DLL). Trzeba dostosować skrypt, by zbierał
     `bin/Release/<tfm>` (własna DLL + `SQLitePCL.pretty.dll`), z pominięciem bibliotek dostarczanych przez serwer.
3. **`tools/update-manifest.py`** — dopisuje wersję + checksum do manifestu.
4. **`.github/workflows/build-dotnet.yml`** i **`release.yml`** — build + Release + auto-commit manifestu
   (tag `v*` → build → GitHub Release → aktualizacja `manifest.json`).
5. **`Directory.Build.props`** — wersjonowanie.

Instrukcja dla użytkownika Jellyfin (do README):
*Dashboard → Plugins → Repositories* → dodaj
`https://raw.githubusercontent.com/<user>/<repo>/master/manifest.json`
(URL **do pliku** `manifest.json`) → instalacja z *Catalog*.

### GUID — uwaga

- Zachowaj `9E6EB40F-9A1A-4CA1-A299-62B4D252453E` (Twój identyfikator).
- **Nie używaj** `5c534381-91a3-43cb-907a-35aa02eb9d2c` (to oficjalna wtyczka Jellyfin — konflikt w katalogu).

---

## 6. Kwestie krytyczne / decyzje projektowe

1. **10.11 vs 12 — jedna czy dwie nogawki?**
   - 12.x (`net10.0`) zmienia `IScheduledTask` (`ExecuteAsync`), usuwa `IServerEntryPoint`, zmienia trigger na enum.
   - „Sztuczka z napi" (jedna binarka `net9.0` na 10.11 i 12) **nie zadziała w pełni tutaj**, bo wtyczka implementuje
     interfejsy, które się zmieniły. Potrzebne `#if NET10_0` (albo dwie osobne implementacje).
   - **Rekomendacja:** najpierw 12.x (`net10.0`, `targetAbi 12.0.0.0`) — zgodnie z naciskiem w zapytaniu; 10.11 dodać
     jako drugi TFM, gdy 12 będzie stabilne.
2. **Powiadomienia** — brak w Jellyfin 12. Zadania `TaskNotifiction*` usunąć albo zastąpić wpisami Activity Log
   (`IActivityManager.CreateAsync`). To zmiana funkcjonalna względem Emby — trzeba potwierdzić z użytkownikiem.
3. **Baza danych** — `SQLitePCL.pretty.netstandard 3.1.0` (tak robi oficjalny port). Trzeba zmigrować istniejące
   dane? Format tabeli pozostaje zgodny (te same kolumny), więc `playback_reporting.db` z Emby można podłożyć.
   `ItemId`/`UserId` w Jellyfin zapisywane jako `Guid("N")` — dane z Emby (jeśli istniały) będą niekompatybilne.
4. **Identyfikatory** — Jellyfin używa `Guid`. Ręczne migracje `InternalId`→`Guid` w `PathItem`/`playsed`/playlistach
   to najżmudniejsza część.
5. **UI** — przepisać `Pages/*.js` (usunąć `define`, `pluginManager`, `viewManager`, `require`); zostawić `chart.js`.
   `chart.min.js` → `Chart.bundle.min.js` (nazwa w oficjalnym porcie).
6. **Obraz wtyczki** — `IHasThumbImage` znika; użyć `imageUrl` (hostowany PNG) lub pominąć.
7. **Zależności w zipie** — pakować `SQLitePCL.pretty.dll`; nie pakować bibliotek Jellyfin.

---

## 7. Proponowany plan realizacji (etapy)

**Etap 0 — decyzje** (patrz pytania na końcu).
**Etap 1 — szkielet projektu**: nowe `.csproj` (`net10.0`, pakiety Jellyfin 12, `FrameworkReference Microsoft.AspNetCore.App`,
`SQLitePCL.pretty.netstandard`), namespace `Jellyfin.Plugin.PlaybackReporting`, `Plugin.cs`, `PluginServiceRegistrator.cs`.
Skompilować „pustą" wtyczkę i zweryfikować ładowanie na serwerze testowym.
**Etap 2 — dane**: `ActivityRepository` + warstwy + `ILogger<T>`; zachować zgodność schematu DB.
**Etap 3 — wejście**: `EventMonitorEntryPoint : IHostedService` + rejestracja; nagrywanie playbacku działa.
**Etap 4 — API**: kontroler MVC z pełnym zestawem endpointów `user_usage_stats`.
**Etap 5 — UI**: `Pages/*.html` w formacie Jellyfin + `EnableInMainMenu` (zakładka w kokpicie), konfiguracja.
**Etap 6 — zadania**: `TaskCleanDb`, `TaskRunBackup`, `TaskCreatePlaylists`; notyfikacje wg decyzji z Etapu 0.
**Etap 7 — repozytorium**: `manifest.json`, `build.sh`, `tools/update-manifest.py`, workflow, README, wersjonowanie.
**Etap 8 — testy**: instalacja z repo na Jellyfin 12.x; smoke test wszystkich raportów i konfiguracji.

---

## 8. Rekomendacja

Port jest **wykonalny i dobrze udokumentowany wzorcem** — istnieje oficjalny port tej samej wtyczki na Jellyfin 12
(`net10.0`), więc architektura docelowa jest znana i sprawdzona. Największy nakład to:
(1) przepisanie wszystkich stron UI, (2) migracja identyfikatorów na `Guid`, (3) decyzja o powiadomieniach i 10.11.

Proponuję oprzeć port na strukturze oficjalnego `jellyfin-plugin-playbackreporting` (12.x) i dołożyć warstwę
repozytorium wzorowaną na `jellyfin-plugin-napi`.

---

## 9. Status wdrożenia (zrealizowane)

Decyzje podjęte z użytkownikiem:
- **Multi-target `net9.0;net10.0`** (Jellyfin 10.11 i 12.x).
- **Powiadomienia → wpisy Activity Log** (`ActivityLogWriter`, `IActivityManager.CreateAsync`).
- Nazewnictwo: namespace `Jellyfin.Plugin.PlaybackReporting`, repo `michalkulik/playback_reporting`.

Co zostało zrobione:

| Obszar | Zmiana |
| --- | --- |
| Projekt | Folder `playback_reporting/` → `Jellyfin.Plugin.PlaybackReporting/`; nowy `.sln` i `.csproj` (multi-target, `FrameworkReference Microsoft.AspNetCore.App`, `SQLitePCL.pretty.netstandard 3.1.0`, `Jellyfin.*` 10.11.11 / 12.0.0) |
| `Plugin.cs` | `BasePlugin<PluginConfiguration>`, `IHasWebPages`; usunięte `IHasThumbImage`; `user_report` z `EnableInMainMenu` (zakładka w kokpicie) |
| `PluginServiceRegistrator.cs` | **Nowy** — `AddHostedService<EventMonitorEntryPoint>()` |
| `EventMonitorEntryPoint.cs` | `IServerEntryPoint` → `IHostedService`; `ILogger<T>`; `Guid`; `TranscodeReason`; `BaseItemKind` |
| `Api/PlaybackReportingActivityController.cs` | **Nowy** kontroler MVC (`[Route("user_usage_stats")]`, `[Authorize(Policy = Policies.RequiresElevation)]`) z pełnym zestawem endpointów; usunięto `Api/UserActivityAPI.cs` |
| `Data/*` | Namespace, `Microsoft.Extensions.Logging`, `SQLiteDatabaseConnection`, `SqliteExtensions` (GetString/GetInt), `Guid` zamiast `InternalId` |
| `Notifications.cs` | **Usunięty** (brak odpowiednika w Jellyfin) |
| `Tasks/*` | `ExecuteAsync(IProgress, CancellationToken)`, `TaskTriggerInfoType.*Trigger`, `Guid`; zadania notyfikacyjne piszą do Activity Log |
| `Pages/*.js` | Przepisane z AMD `define` na **ES modules** (`export default function (view, params)`), `LibraryMenu.setTabs`, `getConfigurationPageUrl`, usunięty `appRouter`/`mainTabsManager` |
| Repozytorium | `manifest.json`, `build.sh`, `tools/update-manifest.py`, `Directory.Build.props`, `.github/workflows/{build-dotnet,release}.yml`, `README.md` |

Weryfikacja: `dotnet build -c Release` dla `net9.0` i `net10.0` — **0 błędów, 0 ostrzeżeń**.
Pakowanie (`build.sh`) i aktualizacja manifestu przetestowane lokalnie (zip zawiera
`Jellyfin.Plugin.PlaybackReporting.dll` + `SQLitePCL.pretty.dll`, MD5 zgodny).

### 9.1. Poprawki po instalacji na Jellyfin 12.1.0 (wersja 3.0.0.2)

Pierwsze uruchomienie na serwerze 12.1.0 wykazało, że **backend działał**, ale strony
nie doładowywały danych („Loading Data...”, puste tabele). Przyczyna leżała w web-API,
które Jellyfin 12 **usunął**, a których używały oryginalne strony Emby:

| Usunięte w Jellyfin 12 | Skutek | Poprawka |
| --- | --- | --- |
| `require([...])` (RequireJS) | `ReferenceError: require is not defined` — handler `viewshow` przerywał się przed pobraniem danych | własny `loadChart()` wstrzykujący `chart.min.js` jako zwykły `<script>` (4 strony) |
| `require(['directorybrowser'])` | brak wyboru folderu/pliku | `window.prompt` na ścieżkę (2 miejsca) |
| `Dashboard.getConfigurationPageUrl()` | `TypeError` w callbacku pobierania → puste tabele | lokalny `getConfigurationPageUrl()` (już był w prelude) |
| parametr `d3` z callbacku RequireJS | `ReferenceError: d3 is not defined` | `window.Chart` (funkcje rysujące i tak używają globalnego `Chart`) |
| `data-require` (custom elements) | brak upgrade'u `emby-*` | nie blokuje działania (elementy natywne); do rozważenia kosmetycznie |

Dodatkowo usunięto martwy `helper_function.js` (nie ładowany przez nic; oficjalny port
Jellyfin również go nie ma).

Weryfikacja: `tools/page-harness` — harness uruchamia każdą stronę w prawdziwej
przeglądarce z zaślepkami globali Jellyfin. Wynik dla wszystkich 9 stron:
**0 błędów**, poprawne wywołania API, `Chart` załadowany tam, gdzie potrzebny,
statusy „Loading Data...” czyszczone.

Do zrobienia po stronie użytkownika / dalsze kroki:
1. Testy runtime na serwerze Jellyfin 12.x (ładowanie wtyczki, zakładka w kokpicie, wszystkie raporty).
2. Utworzenie repo GitHub `michalkulik/playback_reporting`, push i tag `v3.0.0.0` → workflow opublikuje
   wydanie i wpisze checksumy do `manifest.json`.
3. Dodanie URL manifestu w Jellyfin i instalacja z katalogu.

