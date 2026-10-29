- UI
    - zmieniamy kolorystyke - /10x-UI
    - poprawiamy widok aktywnosci - lista fresh-wax mark psuje wyglad
        - fresh-wax mark powinno nie byc widoczne domyslnie - dodajemy jakis maly przycisk lub ikone do oznaczania
        - tytul jazdy - data w jednej linii
        - rower w drugiej linii
        - lancuch - fresh wax - dlugosc jazdy - dlugosc skumulowana -  w trzeciej linii, wartosi liczbowe po prawej, etykiety po lewej
        - rower - lancuch - fresh wax sa etykietami, formatujemy je jak etykietypracujemy nad UI - bedziemy zmieniac kolorystyke
- CHAINS
    -  po wybraniu lancucha w sidebarze nie otwieram nowego okna. otwieram lancuch w glownym oknie, analogicznie do tego jak dziala wybieranie roweru
    - obok naglowka chains dajemy ikone cog. odnosi do manage chains. ale otwiera manage chains w glownym widoku
    - kasujemy przycisk manage chains, kasujemy opcje wejscia do manage chains przez naglowek chains
    - po wybraniu lancucha w sidebarze pokazuja nam sie jego szczegoly
        - startowy przebieg
        - woskowania - item ktory pokazuje przebieg miedzy woskowaniami, od fresh do waxing do nastepnego fresh waxing. info jaki to byl rower. info start i end date
        - przebieg aktualny total
        - przebieg aktywnego woskowania
    - w ustawieniach lancucha ustawiamy threshold miedzy woskowaniami - per lanuch
    - jak przebieg aktywnego woskowania przekroczy threshold, wyswietlamy alert
        - zrobimy tu research jakie sa zalecenia i bedziemy podpowiadac threshold, z mozliwoscia ustawienia manual przez usera
        - 75% thresholdu - lancuch w sidebarze swieci sie na pomaranczowo
        - 100% thresholdu - lancuch w sidebarze swieci sie na czerwono
- Bikes
    - w oknie bikes do kazdej aktywnosci dodajemy skumulowany przebieg roweru - od pierwszej aktywnosci do tej aktywnosci
    - w oknie bikes dajemy maly statusbar/dashboard
        - od kiedy uzywasz roweru
        - total przebieg
        - ilosc jazd
        - sredni przebieg na jazde
        - przebieg w tym roku
        - ilosc jazd w tym roku
        - sredni przebieg na jazde w tym roku


- wdrazamy wszystko na produkcje. obecnie wszystko ladnie dziala na localhoscie, ale na proukcji pojwaia sie info ze nie moze sprawdzic statusu synchronizacji. perwnie musimy uspojnic bazy, sprawdzic sekrreety, ustawienia po stronie strava api - przeprowadz mnie przez to




