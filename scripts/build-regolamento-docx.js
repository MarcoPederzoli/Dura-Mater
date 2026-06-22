"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");

const OUT = path.join(__dirname, "..", "Regolamento-Dura-Mater.docx");

const CONTENT_W = 9026; // A4, margini 1"
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: opts.size })]
  });
}

function bullet(ref, text) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun(text)]
  });
}

function table(headers, rows) {
  const cols = headers.length;
  const colW = Math.floor(CONTENT_W / cols);
  const columnWidths = Array.from({ length: cols }, () => colW);
  const headerRow = new TableRow({
    children: headers.map(text =>
      new TableCell({
        borders,
        width: { size: colW, type: WidthType.DXA },
        shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
      })
    )
  });
  const bodyRows = rows.map(row =>
    new TableRow({
      children: row.map(text =>
        new TableCell({
          borders,
          width: { size: colW, type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun(text)] })]
        })
      )
    })
  );
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths,
    rows: [headerRow, ...bodyRows]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun("Dura Mater — Regolamento  ·  Pagina "),
            new TextRun({ children: [PageNumber.CURRENT] })
          ]
        })]
      })
    },
    children: [
      new Paragraph({ spacing: { after: 400 } }),
      p("DURA MATER", { bold: true, size: 48, center: true }),
      p("Regolamento di gioco", { size: 32, center: true }),
      p("Versione giugno 2026", { italic: true, center: true }),

      h1("Panoramica"),
      p(
        "Dura Mater e' un gioco di carte per 2-16 giocatori (a seconda della griglia). " +
        "Due giochi condividono le stesse regole di posa; cambiano obiettivo e modalita'."
      ),
      table(
        ["", "Multi / singolo", "Torneo / solitario"],
        [
          ["Dura", "Partita competitiva (2+ giocatori)", "Torneo a punteggio"],
          ["Durissima Mater", "Collaborativa (G = N)", "Solitario (G = 1)"]
        ]
      ),
      new Paragraph({ spacing: { after: 200 } }),
      bullet("bullets", "Dura: vince chi svuota per primo la propria mano."),
      bullet("bullets", "Durissima: vince il completamento della griglia NxN (tutte le carte posate)."),
      bullet("bullets", "Il solitario e' previsto solo in Durissima, non in Dura."),

      h1("Componenti"),
      bullet("bullets", "Mazzo di 64 carte, ciascuna identificata da un codice a tre cifre."),
      bullet("bullets", "Scheda di riferimento delle carte (consigliata per Durissima)."),
      bullet("bullets", "Tavolo per costruire la griglia di gioco (la Dura Mater)."),

      h1("Le carte"),
      p("Ogni carta ha tre caratteristiche, lette nel codice a tre cifre (es. 586 = Cinque di Croci Blu):"),
      bullet("bullets", "1a cifra — Valore (da 1 Asso a 8 Otto)"),
      bullet("bullets", "2a cifra — Forma (Cerchi, Cuori, Triangoli, Quadrati, Stelle, Esagoni, Lampi, Croci)"),
      bullet("bullets", "3a cifra — Colore (da Rosso a Bianco)"),
      p("In partita con griglia NxN si usano solo le carte con Valore <= N (sono esattamente N^2 carte)."),

      h1("Preparazione"),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Scegliete il lato N della griglia (da 3 a 8) e il numero di giocatori G.")]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Filtrate e mescolate le carte con Valore <= N.")]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Distribuite le carte in mano:")]
      }),
      bullet("bullets", "Se G <= N: N carte a ciascun giocatore."),
      bullet("bullets", "Se G > N (overcrowd): ripartizione uguale di tutte le N^2 carte; il resto forma il tallone."),
      bullet("bullets", "Ogni giocatore deve avere almeno 3 carte; massimo G = 2N."),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 120 },
        children: [new TextRun("Le carte non distribuite formano il tallone (mazzo di pesca).")]
      }),
      p("Formato ideale: G = N (nessun tallone iniziale). Minimo consigliato: G_min = ceil(N/2), eccezione 7x7 -> 3 giocatori."),

      h1("Regole comuni di posa"),
      bullet("bullets", "La prima carta della partita si posa liberamente."),
      bullet("bullets", "Ogni carta successiva va adiacente (ortogonalmente) ad almeno una carta in gioco."),
      bullet("bullets", "La carta deve condividere almeno una caratteristica (valore, forma o colore) con ogni carta adiacente."),
      bullet("bullets", "Nel turno i requisiti crescono: 1a posa = requisito 1, 2a = 2, 3a = 3, 4a = 4 (adiacenze compatibili richieste)."),
      bullet("bullets", "La griglia non puo' superare N righe e N colonne; prima della chiusura ogni configurazione deve poter stare in una matrice NxN."),

      h2("Dura Mater e inversione turni"),
      bullet("bullets", "La Dura Mater e' la griglia NxN che costruite in partita."),
      bullet("bullets", "1o limite: una fila o colonna continua di N carte fissa una dimensione -> inversione dell'ordine di gioco."),
      bullet("bullets", "2o limite: l'ingombro raggiunge NxN (Dura Mater chiusa) -> seconda inversione."),
      bullet("bullets", "Se in un solo turno si chiudono entrambi i limiti, le due inversioni si annullano."),

      h2("Idea (quinta carta cieca)"),
      bullet("bullets", "Dopo 4 pose legali: 5a carta opzionale a faccia in giu' (jolly = buco/bordo per i legami)."),
      bullet("bullets", "Competitiva/torneo: carta nota solo a chi posa; coop Durissima: nota a tutti."),
      bullet("bullets", "Non si pesca tra 4a e 5a carta."),

      h1("Dura — Partita competitiva"),
      bullet("bullets", "A turno, posate da 1 a 4 carte (+ Idea opzionale). Potete chiudere il turno anche posando meno del massimo."),
      bullet("bullets", "Fine turno: se il tallone non e' vuoto, pesate sempre 1 carta — anche dopo un passo senza posate."),
      bullet("bullets", "Obiettivo: svuotare per primo la propria mano."),
      bullet("bullets", "Vittoria immediata alla posa che svuota la mano (prima della pesca di fine turno)."),
      bullet("bullets", "Monte: se per G turni consecutivi nessuno posa, la partita va a stallo (anche con tallone pieno)."),
      p("Giocatori: minimo 2 (nessun solitario in Dura). Formato consigliato: G = N."),

      h1("Dura — Torneo a punteggio"),
      p("Stesse regole di gioco della partita competitiva; cambiano obiettivo e punteggio. Non si usa in Durissima."),
      bullet("bullets", "Ogni giocatore resta nella stessa sede (G1, G2, ...) per tutto il torneo."),
      bullet("bullets", "Dopo ogni mano il primo giocatore ruota di una posizione in senso orario."),
      bullet("bullets", "Chi svuota la mano per primo non termina la mano: riceve punti pari ai giocatori ancora in gioco, poi si continua."),
      bullet("bullets", "Punti arrivo: 1o a finire = G, 2o = G-1, ... ultimo = 1."),
      bullet("bullets", "Idea (torneo): +1 punto nel momento in cui posate la quarta carta legale in un turno; non conta se poi giocate o meno la quinta carta."),
      bullet("bullets", "Monte: -1 punto per ogni carta ancora in mano (solo chi non e' uscito; il tallone non conta)."),
      bullet("bullets", "Formato naturale: G mani; con molti giocatori si puo' usare un punteggio bersaglio concordato prima."),

      h1("Durissima Mater — Collaborativa"),
      p("Obiettivo comune: completare la griglia NxN. Formato consigliato: G = N giocatori."),
      bullet("bullets", "Regole di posa identiche alla Dura competitiva."),
      bullet("bullets", "Pesca solo se nel turno avete posato almeno una carta; passare senza posare non fa pescare."),
      bullet("bullets", "Mano vuota non finisce la partita: si prosegue finche' la griglia e' piena o si va a monte."),
      bullet("bullets", "Monte: G turni consecutivi senza posate da nessuno (come in competitiva)."),
      bullet("bullets", "Al tavolo: mani e tallone coperti; con la scheda delle 64 carte e il dialogo costruite l'universo noto (quali carte restano, non l'ordine di pesca)."),

      h1("Durissima Mater — Solitario"),
      p("Unico formato solitario del gioco (1 giocatore). Obiettivo: griglia piena. Regole di pesca come in cooperativa."),
      bullet("bullets", "Bloccato senza mosse legali all'inizio del turno: partita persa (regola in revisione)."),
      p("Bilanciamento e regole accessorie (vite, riserva, ecc.) in preparazione; non fa parte della Dura."),

      h1("Riepilogo rapido"),
      table(
        ["Situazione", "Dura competitiva", "Durissima"],
        [
          ["Vittoria", "Mano vuota per primo", "Griglia NxN completa"],
          ["Pesca a fine turno", "Sempre (anche su pass)", "Solo dopo almeno 1 posa"],
          ["Giocatori", "Da 2 a 2N", "Coop: G=N; Solo: G=1"],
          ["Torneo", "Si", "No"]
        ]
      ),
      new Paragraph({ spacing: { after: 240 } }),
      p("Buon gioco!", { bold: true, center: true })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer);
  process.stdout.write(`Scritto: ${OUT}\n`);
});