# AoE II Wiki – čtečka bez reklam (Android)

Neoficiální aplikace pro Android, která zobrazuje obsah
[Age of Empires Series Wiki](https://ageofempires.fandom.com/) zaměřený na
**Age of Empires II: Definitive Edition** – bez reklam, bez sledování, v angličtině,
se světlým i tmavým vzhledem a s možností stáhnout celou wiki do telefonu.

## Co aplikace umí

- **Procházení**: civilizace, jednotky, budovy, technologie, kampaně, hrdinové, mapy a všechny kategorie AoE II.
- **Vyhledávání** v celé wiki (online) i ve stažených článcích (offline).
- **Čisté články**: infoboxy, tabulky (řaditelné ťuknutím na hlavičku), záložky, galerie, prohlížeč obrázků.
- **Světlý / tmavý / systémový vzhled** a nastavitelná velikost písma.
- **Offline režim**: tlačítkem *Download for offline* v Nastavení se stáhnou všechny články AoE II
  (volitelně i obrázky). *Update offline copy* později stáhne jen změněné a nové články.
- Záložky a nedávno zobrazené články.

## Jak funguje

Aplikace nenačítá stránky Fandomu, takže se nikdy nespustí jejich reklamy ani skripty.
Text článků bere přímo z API wiki (`api.php?action=parse`), vyčistí ho a zobrazí ve vlastním vzhledu.
Seznam stránek AoE II si zjišťuje sama z kategorií wiki, takže se přizpůsobí i nově přidanému obsahu.

- `app/src/main/java/…` – nativní část (WebView, síť, mezipaměť obrázků na disku).
- `app/src/main/assets/www/` – rozhraní aplikace (HTML/CSS/JS), články se ukládají do IndexedDB (gzip).

## Sestavení

**GitHub (doporučeno):** každý push do větve `main` spustí workflow *Build APK*, které vytvoří
release se souborem `AoE2-Wiki.apk`. Nejnovější verze je vždy na
`https://github.com/<účet>/<repozitář>/releases/latest/download/AoE2-Wiki.apk`.

**Lokálně:** otevřete složku v Android Studiu, nebo spusťte `./gradlew assembleRelease`
(potřeba JDK 17 a Android SDK). APK bude v `app/build/outputs/apk/release/`.

## Instalace na telefon

1. Stáhněte `AoE2-Wiki.apk` v telefonu.
2. Otevřete ho a povolte instalaci z tohoto zdroje (Android se zeptá sám).
3. Nové verze se instalují přes starou a stažená offline data zůstanou zachována.

Pozn.: APK je podepsané klíčem `app/app-signing.jks`, který je v repozitáři záměrně, aby šly
aktualizace instalovat přes sebe. Pro osobní použití je to v pořádku; aplikaci nešiřte jako oficiální.

## Licence obsahu

Text článků pochází od přispěvatelů Age of Empires Series Wiki na Fandomu a je pod licencí
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/); u každého článku je odkaz na zdroj.
Obrázky patří jejich vlastníkům. Aplikace není spojena s Fandomem, Microsoftem ani World’s Edge.
