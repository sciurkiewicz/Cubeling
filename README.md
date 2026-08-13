# Cubeling

Przeglądarkowy edytor modeli voxelowych 3D zbudowany na Babylon.js.

## Najważniejsze funkcje

- projekty do 60 000 voxeli,
- wydajne renderowanie chunkami `16 × 16 × 16`, obejmujące tylko widoczne ściany,
- canvas od `8 × 8 × 8` do `256 × 256 × 256`,
- rysowanie pojedynczych voxeli, linii, ścian oraz pełnych i pustych brył,
- wypełnienie spójnego obszaru i globalna zamiana koloru,
- symetria względem osi X i Z,
- zaznaczanie jednego voxela lub zakresu przez Shift+klik,
- kopiowanie, przesuwanie, usuwanie, kolorowanie i grupowanie zaznaczenia,
- warstwy Y z izolowaniem, przekrojem, przesuwaniem, duplikowaniem i usuwaniem,
- widoki perspektywiczny, górny, przedni i boczny,
- edytowalne prymitywy oraz teksturowanie i stemple pikselowe,
- import projektu Cubeling JSON, MagicaVoxel `.vox` oraz obrazu jako sprite lub mapa wysokości,
- eksport do zoptymalizowanego GLB, glTF 2.0, OBJ, pełnego lub pustego STL oraz Cubeling JSON,
- historia zmian oparta na różnicach zamiast pełnych kopii projektu,
- automatyczny szkic w IndexedDB i odzyskiwanie po odświeżeniu lub awarii,
- interfejs mobilny z wysuwanym panelem ustawień.

## Uruchomienie

```bash
npm install
npm run dev
```

Produkcja i testy:

```bash
npm run build
npm test
npm run test:e2e
npm run preview
```

Test `test:e2e` uruchamia lokalny Chrome lub Edge w trybie headless i sprawdza również załadowanie modelu zawierającego 60 000 voxeli.

## Sterowanie

- lewy klik — użycie wybranego narzędzia,
- Shift+klik w trybie edycji — zaznaczenie zakresu voxeli,
- Ctrl+klik — dodanie lub usunięcie voxela z zaznaczenia,
- prawy klik — usunięcie voxela lub obiektu,
- środkowy przycisk myszy — obrót kamery,
- rolka — przybliżenie,
- `V`, `B`, `E`, `P`, `T`, `I` — edycja, rysowanie, usuwanie, malowanie, tekstura i próbnik,
- `F` — wycentrowanie modelu,
- `Delete` — usunięcie zaznaczonych voxeli,
- `Ctrl+C` / `Ctrl+V` — kopiowanie i wklejanie,
- `Ctrl+Z` / `Ctrl+Shift+Z` — cofnięcie i ponowienie.

Lokalny szkic służy do odzyskiwania pracy w tej samej przeglądarce. Eksport Cubeling JSON pozostaje przenośnym, edytowalnym zapisem projektu. GLB jest przeznaczony do gier i podglądu 3D, a STL do druku 3D.
