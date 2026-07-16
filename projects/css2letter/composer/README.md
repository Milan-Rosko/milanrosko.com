# CSS2Letter

A browser-based DIN 5008-style A4 letter template with automatic pagination, print output, lightweight inline emphasis, and MathJax equations.

## Use

Open [`blank.html`](blank.html) in a current browser to start a letter from neutral, self-describing fields. The preview paginates after fonts and mathematics finish rendering; use **Print** to open the browser’s A4 print dialog.

[`example.html`](example.html) is the fully populated Walt Disney multi-page demonstration.

No build step is required. An internet connection is needed for the IBM Plex web fonts and MathJax CDN.

## Customize

- Edit `blank.html` for the sender, recipient, metadata, letter paragraphs, signature name, letterhead, and footer.
- The composer starts with visible `Logo` and `Signature` text placeholders, so none of the demonstration artwork appears in a new letter. Replace those elements with your own image references when needed; `assets/logo.png` and `assets/signature.png` show the image hooks used by the populated demo.
- Tune page geometry and typography in `assets/styles/din5008.css`.

Because the letter is written directly in HTML, use ordinary elements such as `<i>` and `<b>` for emphasis. MathJax supports `$inline math$` and `$$display math$$`.

## Geometry

The stylesheet uses the project’s finalized A4 measurements:

| Element | Position or size |
| --- | --- |
| Page | 210 × 297 mm |
| Address window | 25 mm from the left, 50 mm from the top; 80 × 40 mm |
| Information block | 50 mm from the top |
| Subject and date | 100 mm from the top |
| Fold and punch marks | 105 mm, 148.5 mm, and 210 mm |
| First-page body | 110 mm from the top; 31 lines at 5 mm |
| Continuation body | 45 mm from the top; 44 lines at 5 mm |

## Structure

```text
css2letter/
├── blank.html
├── example.html
├── assets/
│   ├── logo.png
│   ├── signature.png
│   ├── reference/
│   ├── scripts/
│   │   ├── letter-engine.js
│   │   └── pagination.js
│   └── styles/
│       └── din5008.css
└── README.md
```

The images under `assets/reference/` are design references and are not loaded by default.
