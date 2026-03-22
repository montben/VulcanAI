"""PDF report generator — produces professional branded construction daily reports using ReportLab."""

import os
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .models import DailyReport

# ---------------------------------------------------------------------------
# Color palette (from spec)
# ---------------------------------------------------------------------------
COLOR_BG = colors.HexColor("#F7F6F2")
COLOR_PRIMARY_TEXT = colors.HexColor("#28251D")
COLOR_PRIMARY_TEAL = colors.HexColor("#01696F")
COLOR_PRIMARY_DARK = colors.HexColor("#0C4E54")
COLOR_MUTED = colors.HexColor("#7A7974")
COLOR_BORDER = colors.HexColor("#D4D1CA")
COLOR_SAFETY_CONCERN_BG = colors.HexColor("#FFF0F0")
COLOR_SAFETY_POSITIVE_BG = colors.HexColor("#E6F4F5")
COLOR_WHITE = colors.HexColor("#FFFFFF")

# Page dimensions
PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.75 * inch


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def _build_styles() -> dict:
    """Build and return a dictionary of ParagraphStyle objects."""
    base = getSampleStyleSheet()
    styles = {}

    styles["title"] = ParagraphStyle(
        "Title",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=COLOR_WHITE,
    )
    styles["section_header"] = ParagraphStyle(
        "SectionHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=20,
        textColor=COLOR_PRIMARY_DARK,
        spaceAfter=6,
        spaceBefore=14,
    )
    styles["subsection_header"] = ParagraphStyle(
        "SubsectionHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=COLOR_PRIMARY_TEAL,
        spaceAfter=4,
        spaceBefore=8,
    )
    styles["body"] = ParagraphStyle(
        "Body",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14,
        textColor=COLOR_PRIMARY_TEXT,
        spaceAfter=4,
    )
    styles["body_bold"] = ParagraphStyle(
        "BodyBold",
        parent=styles["body"],
        fontName="Helvetica-Bold",
    )
    styles["caption"] = ParagraphStyle(
        "Caption",
        parent=base["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9,
        leading=12,
        textColor=COLOR_MUTED,
        spaceAfter=8,
    )
    styles["footer"] = ParagraphStyle(
        "Footer",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=COLOR_MUTED,
        alignment=TA_CENTER,
    )
    styles["meta_label"] = ParagraphStyle(
        "MetaLabel",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=COLOR_MUTED,
    )
    styles["meta_value"] = ParagraphStyle(
        "MetaValue",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14,
        textColor=COLOR_PRIMARY_TEXT,
    )
    styles["bullet"] = ParagraphStyle(
        "Bullet",
        parent=styles["body"],
        leftIndent=18,
        bulletIndent=6,
        spaceAfter=2,
    )
    styles["safety_text"] = ParagraphStyle(
        "SafetyText",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=COLOR_PRIMARY_TEXT,
        spaceAfter=2,
    )
    styles["safety_action"] = ParagraphStyle(
        "SafetyAction",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#C0392B"),
    )
    styles["table_header"] = ParagraphStyle(
        "TableHeader",
        parent=base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=COLOR_WHITE,
    )
    styles["table_cell"] = ParagraphStyle(
        "TableCell",
        parent=base["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=COLOR_PRIMARY_TEXT,
    )

    return styles


# ---------------------------------------------------------------------------
# Page templates (header band + footer)
# ---------------------------------------------------------------------------
class _ReportDocTemplate(BaseDocTemplate):
    """Custom doc template that draws header band and footer on each page."""

    def __init__(self, filename, report: DailyReport, template_config: dict, **kwargs):
        self.report = report
        self.template_config = template_config
        self._styles = _build_styles()
        super().__init__(filename, **kwargs)

    def afterPage(self):
        """Called after each page is rendered."""
        canvas = self.canv
        page_num = canvas.getPageNumber()

        # Footer on every page
        canvas.saveState()
        footer_text = self.template_config.get("footer_text", "Report generated by Vulcan AI")
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(COLOR_MUTED)
        canvas.drawCentredString(
            PAGE_WIDTH / 2,
            0.4 * inch,
            f"{footer_text}  |  Generated {timestamp}  |  Page {page_num}",
        )
        canvas.restoreState()


def _draw_header_band(canvas, doc):
    """Draw the dark teal header band on page 1."""
    canvas.saveState()
    # Background band
    band_height = 1.0 * inch
    canvas.setFillColor(COLOR_PRIMARY_DARK)
    canvas.rect(0, PAGE_HEIGHT - band_height, PAGE_WIDTH, band_height, fill=1, stroke=0)

    # Company name
    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont("Helvetica-Bold", 18)
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.55 * inch, doc.report.company_name)

    # Logo placeholder
    logo_path = doc.template_config.get("branding", {}).get("logo_path")
    if logo_path and os.path.exists(logo_path):
        try:
            canvas.drawImage(
                logo_path,
                PAGE_WIDTH - MARGIN - 1.2 * inch,
                PAGE_HEIGHT - 0.85 * inch,
                width=1.0 * inch,
                height=0.6 * inch,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass  # Skip if logo fails to load
    else:
        # Placeholder rectangle
        canvas.setStrokeColor(COLOR_WHITE)
        canvas.setFillColor(colors.HexColor("#0A3E43"))
        x = PAGE_WIDTH - MARGIN - 1.5 * inch
        y = PAGE_HEIGHT - 0.8 * inch
        canvas.roundRect(x, y, 1.3 * inch, 0.5 * inch, 4, fill=1, stroke=1)
        canvas.setFillColor(COLOR_MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(x + 0.65 * inch, y + 0.18 * inch, "COMPANY LOGO")

    canvas.restoreState()


def _draw_continuation_header(canvas, doc):
    """Draw a minimal header band on continuation pages."""
    canvas.saveState()
    band_height = 0.5 * inch
    canvas.setFillColor(COLOR_PRIMARY_DARK)
    canvas.rect(0, PAGE_HEIGHT - band_height, PAGE_WIDTH, band_height, fill=1, stroke=0)

    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(MARGIN, PAGE_HEIGHT - 0.33 * inch, f"{doc.report.project_name} — Daily Report")

    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 0.33 * inch, doc.report.date)
    canvas.restoreState()


# ---------------------------------------------------------------------------
# Content builders
# ---------------------------------------------------------------------------
def _build_meta_block(report: DailyReport, styles: dict) -> list:
    """Build the project meta info block below the header."""
    elements = []
    elements.append(Spacer(1, 12))

    # Report title
    elements.append(Paragraph("Daily Construction Report", styles["section_header"]))
    elements.append(Spacer(1, 4))

    # Meta table (Project, Date, Weather)
    meta_data = [
        [
            Paragraph("<b>Project:</b>", styles["meta_label"]),
            Paragraph(report.project_name, styles["meta_value"]),
            Paragraph("<b>Date:</b>", styles["meta_label"]),
            Paragraph(report.date, styles["meta_value"]),
        ],
        [
            Paragraph("<b>Weather:</b>", styles["meta_label"]),
            Paragraph(report.weather_summary, styles["meta_value"]),
            Paragraph("", styles["meta_label"]),
            Paragraph("", styles["meta_value"]),
        ],
    ]

    col_widths = [0.8 * inch, 2.5 * inch, 0.7 * inch, 2.5 * inch]
    meta_table = Table(meta_data, colWidths=col_widths)
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 6))

    # Divider line
    divider = Table([[""]],
                    colWidths=[PAGE_WIDTH - 2 * MARGIN],
                    rowHeights=[1])
    divider.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(divider)
    elements.append(Spacer(1, 8))

    return elements


def _build_work_summary_table(report: DailyReport, styles: dict) -> list:
    """Build the work summary section with alternating-row table."""
    elements = []
    elements.append(Paragraph("Work Summary", styles["section_header"]))

    if not report.work_performed:
        elements.append(Paragraph("No work items recorded.", styles["body"]))
        return elements

    col_widths = [1.5 * inch, 3.5 * inch, 1.5 * inch]

    # Header row
    header = [
        Paragraph("Area", styles["table_header"]),
        Paragraph("Description", styles["table_header"]),
        Paragraph("Status", styles["table_header"]),
    ]

    data = [header]
    for item in report.work_performed:
        data.append([
            Paragraph(item.area, styles["table_cell"]),
            Paragraph(item.description, styles["table_cell"]),
            Paragraph(item.status, styles["table_cell"]),
        ])

    table = Table(data, colWidths=col_widths, repeatRows=1)

    # Build style commands
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_PRIMARY_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]

    # Alternating row backgrounds
    for i in range(1, len(data)):
        bg = COLOR_BG if i % 2 == 0 else COLOR_WHITE
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))

    table.setStyle(TableStyle(style_cmds))
    elements.append(table)
    elements.append(Spacer(1, 10))

    return elements


def _build_crew_and_equipment(report: DailyReport, styles: dict) -> list:
    """Build crew summary and equipment list."""
    elements = []
    elements.append(Paragraph("Crew &amp; Equipment", styles["section_header"]))

    # Crew summary
    elements.append(Paragraph(f"<b>Crew:</b> {report.crew_summary}", styles["body"]))
    elements.append(Spacer(1, 4))

    # Equipment list
    if report.equipment_on_site:
        elements.append(Paragraph("<b>Equipment on Site:</b>", styles["body_bold"]))
        for equip in report.equipment_on_site:
            elements.append(
                Paragraph(f"\u2022  {equip}", styles["bullet"])
            )
    else:
        elements.append(Paragraph("<b>Equipment:</b> None recorded.", styles["body"]))

    elements.append(Spacer(1, 6))
    return elements


def _build_materials(report: DailyReport, styles: dict) -> list:
    """Build materials used section."""
    elements = []
    if not report.materials_used:
        return elements

    elements.append(Paragraph("Materials Observed", styles["subsection_header"]))
    for mat in report.materials_used:
        elements.append(Paragraph(f"\u2022  {mat}", styles["bullet"]))
    elements.append(Spacer(1, 6))
    return elements


def _build_safety_section(report: DailyReport, styles: dict) -> list:
    """Build safety observations as colored cards."""
    elements = []
    elements.append(Paragraph("Safety Observations", styles["section_header"]))

    if not report.safety_observations:
        elements.append(Paragraph("No safety observations recorded.", styles["body"]))
        return elements

    for obs in report.safety_observations:
        is_concern = obs.type.lower() == "concern"
        bg_color = COLOR_SAFETY_CONCERN_BG if is_concern else COLOR_SAFETY_POSITIVE_BG
        label = "CONCERN" if is_concern else "POSITIVE"
        label_color = "#C0392B" if is_concern else "#01696F"

        # Build card content
        card_content = []
        card_content.append(
            Paragraph(
                f'<font color="{label_color}"><b>[{label}]</b></font> {obs.description}',
                styles["safety_text"],
            )
        )
        if is_concern and obs.action_needed and obs.action_needed.lower() != "none":
            card_content.append(
                Paragraph(f"ACTION NEEDED: {obs.action_needed}", styles["safety_action"])
            )

        # Wrap in a table cell for background coloring
        inner_table = Table(
            [[card_content]],
            colWidths=[PAGE_WIDTH - 2 * MARGIN - 16],
        )
        inner_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg_color),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))

        elements.append(inner_table)
        elements.append(Spacer(1, 6))

    return elements


def _build_issues_section(report: DailyReport, styles: dict) -> list:
    """Build issues and delays section."""
    elements = []
    elements.append(Paragraph("Issues &amp; Delays", styles["section_header"]))

    if not report.issues_and_delays:
        elements.append(Paragraph("No issues or delays reported.", styles["body"]))
    else:
        for issue in report.issues_and_delays:
            elements.append(Paragraph(f"\u2022  {issue}", styles["bullet"]))

    elements.append(Spacer(1, 6))
    return elements


def _build_photo_documentation(
    report: DailyReport, photos_folder: str, styles: dict, template_config: dict
) -> list:
    """Build photo documentation section — 2-up layout with captions."""
    elements = []
    elements.append(Paragraph("Photo Documentation", styles["section_header"]))

    if not report.photos_with_captions:
        elements.append(Paragraph("No photos included in this report.", styles["body"]))
        return elements

    layout = template_config.get("layout", {})
    photos_per_row = layout.get("photos_per_row", 2)
    photo_width = layout.get("photo_width_inches", 3.0) * inch

    # Build list of cell flowables — each cell is a list [image_or_placeholder, caption]
    # wrapped in a small inner Table so each cell is a single flowable.
    col_width = (PAGE_WIDTH - 2 * MARGIN) / photos_per_row
    inner_w = col_width - 8  # account for padding

    def _make_photo_cell(pc):
        """Return a single Table flowable containing the photo + caption."""
        img_path = os.path.join(photos_folder, pc.filename)
        found = os.path.exists(img_path)
        if not found:
            # Try case-insensitive match
            folder = Path(photos_folder)
            try:
                matches = [p for p in folder.iterdir() if p.name.lower() == pc.filename.lower()]
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
                rows.append([Paragraph(f"[Could not load: {pc.filename}]", styles["caption"])])
        else:
            rows.append([Paragraph(f"[Photo not found: {pc.filename}]", styles["caption"])])

        rows.append([Paragraph(pc.caption, styles["caption"])])

        t = Table(rows, colWidths=[inner_w])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return t

    photo_cells = [_make_photo_cell(pc) for pc in report.photos_with_captions]

    # Arrange into rows of `photos_per_row`
    for i in range(0, len(photo_cells), photos_per_row):
        row = photo_cells[i : i + photos_per_row]
        # Pad if last row is incomplete
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


def _build_next_day_plan(report: DailyReport, styles: dict) -> list:
    """Build next day plan section if available."""
    if not report.next_day_plan:
        return []
    elements = []
    elements.append(Paragraph("Next Day Plan", styles["section_header"]))
    elements.append(Paragraph(report.next_day_plan, styles["body"]))
    elements.append(Spacer(1, 8))
    return elements


def _build_disclaimer(styles: dict) -> list:
    """Build the AI disclaimer for the last page."""
    elements = []
    elements.append(Spacer(1, 20))

    disclaimer_table = Table(
        [[Paragraph(
            "<i>This report was generated using AI-assisted analysis. "
            "Verify all observations on site.</i>",
            styles["caption"],
        )]],
        colWidths=[PAGE_WIDTH - 2 * MARGIN],
    )
    disclaimer_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("BOX", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
    ]))
    elements.append(disclaimer_table)
    return elements


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate_report_pdf(
    report: DailyReport,
    photos_folder: str,
    output_path: str,
    template_config: dict,
) -> str:
    """Generate a professional branded PDF daily construction report.

    Returns the path to the generated PDF file.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    styles = _build_styles()

    # Frame for page 1 (extra top margin for header band)
    frame_page1 = Frame(
        MARGIN,
        MARGIN + 0.3 * inch,  # bottom margin for footer
        PAGE_WIDTH - 2 * MARGIN,
        PAGE_HEIGHT - 2 * MARGIN - 0.7 * inch,  # account for header band
        id="page1_frame",
    )

    # Frame for continuation pages (smaller header)
    frame_cont = Frame(
        MARGIN,
        MARGIN + 0.3 * inch,
        PAGE_WIDTH - 2 * MARGIN,
        PAGE_HEIGHT - 2 * MARGIN - 0.2 * inch,
        id="cont_frame",
    )

    doc = _ReportDocTemplate(
        output_path,
        report=report,
        template_config=template_config,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    page1_template = PageTemplate(
        id="page1",
        frames=[frame_page1],
        onPage=_draw_header_band,
    )
    cont_template = PageTemplate(
        id="continuation",
        frames=[frame_cont],
        onPage=_draw_continuation_header,
    )

    doc.addPageTemplates([page1_template, cont_template])

    # Build content flowables
    elements = []

    # Page 1 content
    elements.extend(_build_meta_block(report, styles))
    elements.extend(_build_work_summary_table(report, styles))
    elements.extend(_build_crew_and_equipment(report, styles))
    elements.extend(_build_materials(report, styles))

    # Switch to continuation page template for subsequent pages
    elements.append(NextPageTemplate("continuation"))

    # Page 2+ content
    elements.extend(_build_safety_section(report, styles))
    elements.extend(_build_issues_section(report, styles))
    elements.extend(_build_next_day_plan(report, styles))
    elements.extend(_build_photo_documentation(report, photos_folder, styles, template_config))

    # Final disclaimer
    elements.extend(_build_disclaimer(styles))

    doc.build(elements)
    return output_path
