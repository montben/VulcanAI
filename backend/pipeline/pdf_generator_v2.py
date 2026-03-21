"""V2 PDF report generator — produces professional construction daily reports
from StructuredDailyReport using ReportLab."""

import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    NextPageTemplate,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .schemas import StructuredDailyReport

# ---------------------------------------------------------------------------
# Color palette (matches v1 generator)
# ---------------------------------------------------------------------------
COLOR_BG = colors.HexColor("#F7F6F2")
COLOR_PRIMARY_TEXT = colors.HexColor("#28251D")
COLOR_PRIMARY_TEAL = colors.HexColor("#01696F")
COLOR_PRIMARY_DARK = colors.HexColor("#0C4E54")
COLOR_MUTED = colors.HexColor("#7A7974")
COLOR_BORDER = colors.HexColor("#D4D1CA")
COLOR_WHITE = colors.HexColor("#FFFFFF")

# Status colors
COLOR_STATUS_COMPLETED = colors.HexColor("#2E7D32")
COLOR_STATUS_IN_PROGRESS = colors.HexColor("#F57F17")
COLOR_STATUS_STARTED = colors.HexColor("#1565C0")

# Severity colors
COLOR_SEVERITY_HIGH = colors.HexColor("#C62828")
COLOR_SEVERITY_MEDIUM = colors.HexColor("#EF6C00")
COLOR_SEVERITY_LOW = colors.HexColor("#546E7A")

# Safety card
COLOR_SAFETY_BG = colors.HexColor("#FFFDE7")

# Page dimensions
PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.75 * inch
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def _build_styles() -> dict:
    base = getSampleStyleSheet()
    s = {}

    s["title"] = ParagraphStyle(
        "V2Title", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=22, leading=26,
        textColor=COLOR_WHITE,
    )
    s["subtitle"] = ParagraphStyle(
        "V2Subtitle", parent=base["Normal"],
        fontName="Helvetica", fontSize=11, leading=14,
        textColor=colors.HexColor("#A0D8DA"),
    )
    s["section_header"] = ParagraphStyle(
        "V2SectionHeader", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=14, leading=18,
        textColor=COLOR_PRIMARY_DARK, spaceAfter=6, spaceBefore=14,
    )
    s["body"] = ParagraphStyle(
        "V2Body", parent=base["Normal"],
        fontName="Helvetica", fontSize=10.5, leading=14,
        textColor=COLOR_PRIMARY_TEXT, spaceAfter=4,
    )
    s["body_bold"] = ParagraphStyle(
        "V2BodyBold", parent=s["body"], fontName="Helvetica-Bold",
    )
    s["meta_label"] = ParagraphStyle(
        "V2MetaLabel", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, leading=13,
        textColor=COLOR_MUTED,
    )
    s["meta_value"] = ParagraphStyle(
        "V2MetaValue", parent=base["Normal"],
        fontName="Helvetica", fontSize=10, leading=13,
        textColor=COLOR_PRIMARY_TEXT,
    )
    s["table_header"] = ParagraphStyle(
        "V2TableHeader", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=10, leading=13,
        textColor=COLOR_WHITE,
    )
    s["table_cell"] = ParagraphStyle(
        "V2TableCell", parent=base["Normal"],
        fontName="Helvetica", fontSize=9.5, leading=12,
        textColor=COLOR_PRIMARY_TEXT,
    )
    s["caption_bold"] = ParagraphStyle(
        "V2CaptionBold", parent=base["Normal"],
        fontName="Helvetica-Bold", fontSize=9, leading=12,
        textColor=COLOR_PRIMARY_TEXT, spaceAfter=1,
    )
    s["caption_italic"] = ParagraphStyle(
        "V2CaptionItalic", parent=base["Normal"],
        fontName="Helvetica-Oblique", fontSize=8.5, leading=11,
        textColor=COLOR_MUTED, spaceAfter=6,
    )
    s["bullet"] = ParagraphStyle(
        "V2Bullet", parent=s["body"],
        leftIndent=18, bulletIndent=6, spaceAfter=2,
    )
    s["safety_text"] = ParagraphStyle(
        "V2SafetyText", parent=base["Normal"],
        fontName="Helvetica", fontSize=10, leading=13,
        textColor=COLOR_PRIMARY_TEXT, spaceAfter=2,
    )
    s["footer"] = ParagraphStyle(
        "V2Footer", parent=base["Normal"],
        fontName="Helvetica", fontSize=8, leading=10,
        textColor=COLOR_MUTED, alignment=TA_CENTER,
    )
    s["disclaimer"] = ParagraphStyle(
        "V2Disclaimer", parent=base["Normal"],
        fontName="Helvetica-Oblique", fontSize=9, leading=12,
        textColor=COLOR_MUTED, spaceAfter=8,
    )

    return s


# ---------------------------------------------------------------------------
# Page callbacks
# ---------------------------------------------------------------------------
def _draw_page1_header(canvas, doc):
    """Dark teal header band on page 1."""
    canvas.saveState()
    band_height = 1.1 * inch
    canvas.setFillColor(COLOR_PRIMARY_DARK)
    canvas.rect(0, PAGE_HEIGHT - band_height, PAGE_WIDTH, band_height, fill=1, stroke=0)

    # Project name
    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont("Helvetica-Bold", 20)
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.45 * inch, doc.project_name)

    # Subtitle
    canvas.setFont("Helvetica", 10)
    canvas.setFillColor(colors.HexColor("#A0D8DA"))
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.65 * inch, "DAILY SITE REPORT")

    # Date (right side)
    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 0.45 * inch, doc.report_date)

    canvas.restoreState()

    # Footer
    _draw_footer(canvas, doc)


def _draw_continuation_header(canvas, doc):
    """Minimal header on continuation pages."""
    canvas.saveState()
    band_height = 0.5 * inch
    canvas.setFillColor(COLOR_PRIMARY_DARK)
    canvas.rect(0, PAGE_HEIGHT - band_height, PAGE_WIDTH, band_height, fill=1, stroke=0)

    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.33 * inch, f"{doc.project_name} — Daily Site Report")

    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 0.33 * inch, doc.report_date)
    canvas.restoreState()

    _draw_footer(canvas, doc)


def _draw_footer(canvas, doc):
    canvas.saveState()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    page_num = canvas.getPageNumber()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(COLOR_MUTED)
    canvas.drawCentredString(
        PAGE_WIDTH / 2, 0.4 * inch,
        f"SiteScribe AI  |  Generated {timestamp}  |  Page {page_num}",
    )
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------
def _divider(styles: dict) -> Table:
    t = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[1])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _build_metadata(report: StructuredDailyReport, styles: dict) -> list:
    elements = [Spacer(1, 14)]
    meta = report.metadata
    data = [
        [
            Paragraph("<b>Location:</b>", styles["meta_label"]),
            Paragraph(meta.location, styles["meta_value"]),
            Paragraph("<b>Weather:</b>", styles["meta_label"]),
            Paragraph(meta.weather, styles["meta_value"]),
        ],
        [
            Paragraph("<b>Prepared By:</b>", styles["meta_label"]),
            Paragraph(meta.prepared_by, styles["meta_value"]),
            Paragraph("<b>Date:</b>", styles["meta_label"]),
            Paragraph(meta.report_date, styles["meta_value"]),
        ],
    ]
    col_widths = [1.0 * inch, 2.3 * inch, 0.9 * inch, 2.3 * inch]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 6))
    elements.append(_divider(styles))
    elements.append(Spacer(1, 8))
    return elements


def _build_summary(report: StructuredDailyReport, styles: dict) -> list:
    if not report.summary:
        return []
    elements = [
        Paragraph("Summary", styles["section_header"]),
        Paragraph(report.summary, styles["body"]),
        Spacer(1, 6),
    ]
    return elements


def _status_color(status: str) -> colors.HexColor:
    return {
        "completed": COLOR_STATUS_COMPLETED,
        "in_progress": COLOR_STATUS_IN_PROGRESS,
        "started": COLOR_STATUS_STARTED,
    }.get(status, COLOR_PRIMARY_TEXT)


def _build_work_completed(report: StructuredDailyReport, styles: dict) -> list:
    elements = [Paragraph("Work Completed", styles["section_header"])]
    if not report.work_completed:
        elements.append(Paragraph("No work items recorded.", styles["body"]))
        return elements

    col_widths = [1.8 * inch, 3.0 * inch, 1.7 * inch]
    header = [
        Paragraph("Area", styles["table_header"]),
        Paragraph("Task", styles["table_header"]),
        Paragraph("Status", styles["table_header"]),
    ]
    data = [header]
    for item in report.work_completed:
        sc = _status_color(item.status)
        label = item.status.replace("_", " ").title()
        data.append([
            Paragraph(item.area, styles["table_cell"]),
            Paragraph(item.task, styles["table_cell"]),
            Paragraph(f'<font color="{sc.hexval()}">{label}</font>', styles["table_cell"]),
        ])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]
    for i in range(1, len(data)):
        bg = COLOR_BG if i % 2 == 0 else COLOR_WHITE
        cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    table.setStyle(TableStyle(cmds))
    elements.append(table)
    elements.append(Spacer(1, 8))
    return elements


def _build_progress_update(report: StructuredDailyReport, styles: dict) -> list:
    if not report.progress_update:
        return []
    return [
        Paragraph("Progress Update", styles["section_header"]),
        Paragraph(report.progress_update, styles["body"]),
        Spacer(1, 6),
    ]


def _severity_color(severity: str) -> colors.HexColor:
    return {
        "high": COLOR_SEVERITY_HIGH,
        "medium": COLOR_SEVERITY_MEDIUM,
        "low": COLOR_SEVERITY_LOW,
    }.get(severity, COLOR_PRIMARY_TEXT)


def _build_issues_delays(report: StructuredDailyReport, styles: dict) -> list:
    elements = [Paragraph("Issues &amp; Delays", styles["section_header"])]
    if not report.issues_delays:
        elements.append(Paragraph("No issues or delays reported.", styles["body"]))
        return elements

    col_widths = [2.5 * inch, 2.5 * inch, 1.5 * inch]
    header = [
        Paragraph("Issue", styles["table_header"]),
        Paragraph("Impact", styles["table_header"]),
        Paragraph("Severity", styles["table_header"]),
    ]
    data = [header]
    for item in report.issues_delays:
        sc = _severity_color(item.severity)
        label = item.severity.upper()
        data.append([
            Paragraph(item.issue, styles["table_cell"]),
            Paragraph(item.impact, styles["table_cell"]),
            Paragraph(f'<font color="{sc.hexval()}">{label}</font>', styles["table_cell"]),
        ])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]
    for i in range(1, len(data)):
        bg = COLOR_BG if i % 2 == 0 else COLOR_WHITE
        cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    table.setStyle(TableStyle(cmds))
    elements.append(table)
    elements.append(Spacer(1, 8))
    return elements


def _build_safety_notes(report: StructuredDailyReport, styles: dict) -> list:
    elements = [Paragraph("Safety Notes", styles["section_header"])]
    if not report.safety_notes:
        elements.append(Paragraph("No safety observations recorded.", styles["body"]))
        return elements

    for note in report.safety_notes:
        card_rows = []
        card_rows.append([Paragraph(note.observation, styles["safety_text"])])
        if note.action_required:
            card_rows.append([
                Paragraph(
                    f'<font color="#C62828"><b>Action Required:</b></font> {note.action_required}',
                    styles["safety_text"],
                )
            ])

        card = Table(card_rows, colWidths=[CONTENT_WIDTH - 16])
        card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), COLOR_SAFETY_BG),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elements.append(card)
        elements.append(Spacer(1, 6))

    return elements


def _priority_badge(priority: str) -> str:
    color_map = {
        "high": "#C62828",
        "medium": "#EF6C00",
        "low": "#546E7A",
    }
    c = color_map.get(priority, "#546E7A")
    label = priority.upper()
    return f'<font color="{c}"><b>[{label}]</b></font>'


def _build_next_steps(report: StructuredDailyReport, styles: dict) -> list:
    elements = [Paragraph("Next Steps", styles["section_header"])]
    if not report.next_steps:
        elements.append(Paragraph("No next steps recorded.", styles["body"]))
        return elements

    for step in report.next_steps:
        badge = _priority_badge(step.priority)
        elements.append(
            Paragraph(f"\u2022  {badge}  {step.task}", styles["bullet"])
        )
    elements.append(Spacer(1, 6))
    return elements


def _build_resources(report: StructuredDailyReport, styles: dict) -> list:
    res = report.resources_mentioned
    elements = [Paragraph("Resources", styles["section_header"])]
    elements.append(Paragraph(f"<b>Crew:</b> {res.crew_summary}", styles["body"]))

    if res.equipment:
        elements.append(Spacer(1, 2))
        elements.append(Paragraph("<b>Equipment:</b>", styles["body_bold"]))
        for eq in res.equipment:
            elements.append(Paragraph(f"\u2022  {eq}", styles["bullet"]))

    if res.materials:
        elements.append(Spacer(1, 2))
        elements.append(Paragraph("<b>Materials:</b>", styles["body_bold"]))
        for mat in res.materials:
            elements.append(Paragraph(f"\u2022  {mat}", styles["bullet"]))

    elements.append(Spacer(1, 8))
    return elements


def _build_additional_notes(report: StructuredDailyReport, styles: dict) -> list:
    if not report.additional_notes:
        return []
    return [
        Paragraph("Additional Notes", styles["section_header"]),
        Paragraph(report.additional_notes, styles["body"]),
        Spacer(1, 6),
    ]


def _build_photos(report: StructuredDailyReport, photos_dir: str, styles: dict) -> list:
    if not report.photo_descriptions:
        return []

    elements = [
        PageBreak(),
        Paragraph("Photo Documentation", styles["section_header"]),
    ]

    photo_width = 3.0 * inch
    photos_per_row = 2
    col_width = CONTENT_WIDTH / photos_per_row
    inner_w = col_width - 8

    def _make_cell(photo):
        img_path = os.path.join(photos_dir, photo.filename)
        found = os.path.exists(img_path)
        if not found:
            folder = Path(photos_dir)
            try:
                matches = [p for p in folder.iterdir() if p.name.lower() == photo.filename.lower()]
            except FileNotFoundError:
                matches = []
            if matches:
                img_path = str(matches[0])
                found = True

        rows = []
        if found:
            try:
                img = Image(img_path, width=photo_width, height=photo_width * 0.75)
                img.hAlign = "CENTER"
                rows.append([img])
            except Exception:
                rows.append([Paragraph(f"[Could not load: {photo.filename}]", styles["caption_italic"])])
        else:
            rows.append([Paragraph(f"[Photo not found: {photo.filename}]", styles["caption_italic"])])

        if photo.caption:
            rows.append([Paragraph(photo.caption, styles["caption_bold"])])
        if photo.ai_description:
            rows.append([Paragraph(photo.ai_description, styles["caption_italic"])])

        t = Table(rows, colWidths=[inner_w])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return t

    cells = [_make_cell(p) for p in report.photo_descriptions]

    for i in range(0, len(cells), photos_per_row):
        row = cells[i : i + photos_per_row]
        while len(row) < photos_per_row:
            row.append(Spacer(1, 1))

        photo_table = Table([row], colWidths=[col_width] * photos_per_row)
        photo_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(photo_table)

    return elements


def _build_disclaimer(styles: dict) -> list:
    elements = [Spacer(1, 20)]
    t = Table(
        [[Paragraph(
            "<i>This report was generated using AI-assisted analysis. "
            "Verify all observations on site.</i>",
            styles["disclaimer"],
        )]],
        colWidths=[CONTENT_WIDTH],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]))
    elements.append(t)
    return elements


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate_report_pdf_v2(
    report: StructuredDailyReport,
    photos_dir: str,
    pdf_path: str,
) -> None:
    """Generate a professional branded PDF from a StructuredDailyReport."""
    os.makedirs(os.path.dirname(pdf_path) or ".", exist_ok=True)

    styles = _build_styles()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.8 * inch,  # space for header band
        bottomMargin=MARGIN + 0.2 * inch,  # space for footer
    )

    # Stash metadata on doc so page callbacks can read it
    doc.project_name = report.metadata.project_name
    doc.report_date = report.metadata.report_date

    # Build flowables
    elements = []
    elements.extend(_build_metadata(report, styles))
    elements.extend(_build_summary(report, styles))
    elements.extend(_build_work_completed(report, styles))
    elements.extend(_build_progress_update(report, styles))
    elements.extend(_build_issues_delays(report, styles))
    elements.extend(_build_safety_notes(report, styles))
    elements.extend(_build_next_steps(report, styles))
    elements.extend(_build_resources(report, styles))
    elements.extend(_build_additional_notes(report, styles))
    elements.extend(_build_disclaimer(styles))
    elements.extend(_build_photos(report, photos_dir, styles))

    doc.build(
        elements,
        onFirstPage=_draw_page1_header,
        onLaterPages=_draw_continuation_header,
    )
