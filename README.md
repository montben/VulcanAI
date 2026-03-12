# SiteScribe AI v1.0

A Python CLI pipeline that takes construction jobsite photos and generates professional branded PDF daily construction reports using AI vision models.

## Quick Start

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure API key:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Add jobsite photos** to `sample_input/` (JPG/PNG).

4. **Run the pipeline:**
   ```bash
   python main.py --photos ./sample_input --notes ./notes.txt \
       --company "ABC Construction" --project "Smith Residence Remodel"
   ```

5. **Open the PDF** in `output/`.

## CLI Arguments

| Argument    | Default            | Description                              |
|-------------|--------------------|------------------------------------------|
| `--photos`  | `./sample_input/`  | Path to folder of jobsite photos         |
| `--notes`   | None               | Path to .txt file with voice notes       |
| `--company` | "Construction Co." | Company name for the report header       |
| `--project` | "Project"          | Project name for the report header       |
| `--output`  | `./output/`        | Output directory for the generated PDF   |

## Project Structure

```
sitescribe-v1/
|-- main.py              # Entry point - CLI interface
|-- analyzer.py          # Photo analysis with Vision API
|-- synthesizer.py       # Report narrative generation
|-- pdf_generator.py     # PDF rendering with ReportLab
|-- models.py            # Pydantic data models
|-- config.py            # API keys, settings
|-- prompts/
|   |-- photo_analysis.txt
|   +-- report_synthesis.txt
|-- templates/
|   +-- default_template.json
|-- sample_input/        # Test photos go here
|-- output/              # Generated PDFs go here
|-- requirements.txt
+-- README.md
```

## How It Works

1. **Photo Analysis** — Each photo is sent to GPT-4o Vision with a construction-specific prompt. Returns structured JSON per photo.
2. **Report Synthesis** — A second LLM call combines all photo analyses + optional voice notes into a unified daily report.
3. **PDF Generation** — ReportLab renders a professional branded multi-page PDF with embedded photos, tables, and safety cards.
