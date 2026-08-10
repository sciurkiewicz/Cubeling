# Cubeling

Przeglądarkowy edytor modeli voxelowych 3D zbudowany na Babylon.js.

## Funkcje

- konfiguracja canvasu voxelowego od 8×8 do 256×256 z limitem wysokości,
- mapowanie 1:1: jedna komórka siatki = jeden voxel = jeden piksel tekstury,
- ciągłe rysowanie voxelami przez przeciąganie, także poza widocznym obszarem gridu,
- wyraźne tryby „Rysuj voxele” i „Edytuj obiekt”,
- dodawanie, usuwanie i kolorowanie voxeli,
- malowanie kliknięciem lub przeciągnięciem pędzla po voxelach,
- dodatkowe kształty: skalowalny Box, piramida, koło, plane i billboard; rozmiar można ustawić przed dodaniem, liczbowo po zaznaczeniu albo uchwytami X/Y/Z bezpośrednio w widoku,
- wgrywanie tekstur PNG, JPG i WebP oraz rozkładanie ich na voxelach według pozycji na canvasie,
- eksport do GLB, glTF 2.0, OBJ, STL i edytowalnego projektu Cubeling JSON,
- historia zmian, automatyczny zapis lokalny i import projektu.

## Uruchomienie

```bash
npm install
npm run dev
```

Produkcja:

```bash
npm run build
npm run preview
```

## Sterowanie

- lewy klik lub przeciągnięcie — użycie wybranego narzędzia,
- prawy lub środkowy przycisk myszy — obrót kamery,
- rolka — zoom,
- `V`, `B`, `E`, `P`, `T` — wybierz, dodaj, usuń, maluj, teksturuj,
- `F` — wycentruj model,
- `Ctrl+Z` / `Ctrl+Shift+Z` — cofnij / ponów.

Projekt nie jest automatycznie zapisywany ani wczytywany. Przy zamykaniu lub odświeżaniu karty z niezapisanymi zmianami przeglądarka pokazuje ostrzeżenie. Eksport do Cubeling JSON (`*.cubeling.json`) zapisuje edytowalny projekt, który można później zaimportować. Do przenoszenia modelu z teksturami najlepiej użyć GLB; STL jest przeznaczony do druku 3D, a OBJ do uniwersalnej geometrii siatkowej.
