#!/usr/bin/env python3
"""Politics Prediction - forecast error (Brier) vs the market and the best public LLM.
Data: Vila Politica v3, 1,598 paired BR electoral events 1945-2024 (README ground truth).
Newer 2026 frontier models have no public election-forecasting benchmark, so the LLM bar is
labelled generically ("best public LLM forecaster"). Dark, site-matching. PNG (web) + PDF."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img")
os.makedirs(OUT, exist_ok=True)

# real numbers (lower Brier = better), best-first
labels = ["Recursivo\nPolitics Prediction", "Polymarket\nmarket aggregate", "Best public LLM\nforecaster, 2026"]
brier = [0.0475, 0.0838, 0.102]
notes = ["", "1.76x sharper", "2.1x sharper"]  # our edge vs each

INK = "#f0f0f3"; MUT = "#a6a6ae"; FAINT = "#70707a"
SIG = "#5fd39b"; BAR = "#39414d"
OURS = 0

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"],
    "font.size": 13, "text.color": INK,
    "figure.dpi": 300, "savefig.dpi": 300, "savefig.bbox": "tight",
})

fig, ax = plt.subplots(figsize=(8.4, 3.5))
fig.patch.set_alpha(0.0); ax.patch.set_alpha(0.0)

y = list(range(len(labels)))
colors = [BAR] * len(labels); colors[OURS] = SIG
bars = ax.barh(y, brier, height=0.66, color=colors, edgecolor="none", zorder=3)

ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=12.5, color=MUT)
ax.get_yticklabels()[OURS].set_color(INK)
ax.invert_yaxis()
ax.set_xlim(0, 0.126)
for s in ("top", "right", "left", "bottom"):
    ax.spines[s].set_visible(False)
ax.tick_params(axis="y", length=0)
ax.set_xticks([])  # numbers live on the bars, keep it clean

# value + edge labels on each bar
for i, (b, val) in enumerate(zip(bars, brier)):
    c = SIG if i == OURS else INK
    ax.text(b.get_width() + 0.003, b.get_y() + b.get_height() / 2,
            f"{val:.4f}", va="center", ha="left", fontsize=13, color=c,
            fontweight="bold", family="monospace")
    if notes[i]:
        ax.text(b.get_width() - 0.004, b.get_y() + b.get_height() / 2,
                notes[i], va="center", ha="right", fontsize=10.5, color=FAINT,
                family="monospace")

ax.set_title("Election forecast error  ·  Brier score, lower is better",
             fontsize=13.5, color=INK, fontweight="bold", loc="left", pad=14)
ax.text(0, 1.005, "", transform=ax.transAxes)
fig.text(0.5, -0.02, "1,598 Brazilian races, 1945-2024. Scored out of sample.",
         ha="center", fontsize=10.5, color=FAINT, family="monospace")

for ext in ("png", "pdf"):
    p = os.path.join(OUT, f"politics_brier.{ext}")
    fig.savefig(p, transparent=True)
    print("saved", p, os.path.getsize(p), "bytes")
