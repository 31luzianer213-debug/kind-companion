---
name: kaio-ler-print
description: Use when the user mentions a print, screenshot, "captura de tela", "print da tela", a copied image, or asks to fix/explain something shown in a screenshot they just took. Reads the screenshot as text through local OCR, so it works even when the model has no vision support.
---

# Reading the user's screenshot (local OCR)

The user takes screenshots with Win+Shift+S, which leaves the image in the
clipboard. This project ships a local OCR script that turns that image into
text. You do NOT need vision support: run the script and read its output.

## How to run it

From the project root, run exactly:

    powershell -NoProfile -ExecutionPolicy Bypass -Sta -File ".opencode/skills/kaio-ler-print/ler-print.ps1"

- No arguments: reads the image currently in the clipboard. Use this when the
  user says they just took or copied a print.
- If the user gives a path to an image file, pass it with forward slashes:

    powershell -NoProfile -ExecutionPolicy Bypass -Sta -File ".opencode/skills/kaio-ler-print/ler-print.ps1" -ImagePath "C:/caminho/do/print.png"

## How to treat the output

- The transcription is APPROXIMATE. OCR inserts spurious spaces in paths:
  "src/lib/file . js : 3191 : 31" means src/lib/file.js line 3191 column 31.
  Normalize before using.
- The screenshot is an ADDRESS, not a source. Symbol-heavy code (regexes,
  brackets, escapes) comes out mangled — never copy code from the OCR text.
  Use the file path and line number to open the real file and read the true
  code there.
- If the output starts with "ERRO:" saying there is no image in the
  clipboard, tell the user (in their language) to take the screenshot again
  with Win+Shift+S and repeat the request right away, before copying
  anything else.
- If the user's complaint is about looks — alignment, colors, spacing,
  something visually "broken" — be honest: OCR reads text only and cannot
  see layout or colors. Ask the user to describe in words what is wrong,
  and use the text you did get to locate the right area in the code.
- Always reply in the user's language.
