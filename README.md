# Allenamento Corsa

App da installare sul telefono per preparare le gare di corsa, a partire dalla Mezza di Napoli del 21 febbraio 2027.

Cosa fa:

- **Oggi**: l'allenamento del giorno, già adattato a come stai. Se segni dolore al tallone o tanta stanchezza, o se negli ultimi giorni hai caricato troppo, l'app accorcia l'uscita o toglie il ritmo e ti spiega perché.
- **Forma**: stima del tempo sulla mezza, carico degli ultimi 7 giorni rispetto al solito, passo a 140 battiti nel tempo, km a settimana, quanto tempo passi nelle zone facili e i tuoi ritmi aggiornati.
- **Piano**: tutte le settimane fino alla gara, con gli allenamenti fatti, saltati e da fare. I ritmi scritti nel piano si aggiornano con la tua forma e dopo il test dei 5 km.
- **Dati**: carichi i file del Garmin (zip, .fit o Activities.csv). Nessun dato lascia il telefono.

## Come si usa sul telefono

1. Apri l'indirizzo dell'app con Safari (iPhone) o Chrome (Android).
2. iPhone: tasto Condividi, poi **Aggiungi alla schermata Home**. Android: menu ⋮, poi **Installa app**.
3. Vai su **Dati** e carica i file delle corse.

## Per chi sviluppa

Pagina statica, senza installazioni né librerie esterne: `index.html`, `style.css` e i moduli in `js/`.
Per provarla sul computer: `python3 -m http.server` nella cartella e apri `http://localhost:8000`.
Pubblicazione: GitHub Pages dal ramo `main`, cartella principale.
