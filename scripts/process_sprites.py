import json
import os
from collections import deque
import numpy as np
from PIL import Image

RAW_DIR = "raw_assets"
IMG_OUT = os.path.join("public", "assets", "images")
os.makedirs(IMG_OUT, exist_ok=True)


def rgb_to_hsv_np(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Convert float32 RGB [0..1] (H,W,3) to H (0..360), S (0..1), V (0..1)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    h = np.zeros_like(cmax)
    mask = delta > 1e-6
    r_eq = mask & (cmax == r)
    g_eq = mask & (cmax == g)
    b_eq = mask & (cmax == b)

    h[r_eq] = (60.0 * (((g[r_eq] - b[r_eq]) / delta[r_eq]) % 6.0))
    h[g_eq] = (60.0 * (((b[g_eq] - r[g_eq]) / delta[g_eq]) + 2.0))
    h[b_eq] = (60.0 * (((r[b_eq] - g[b_eq]) / delta[b_eq]) + 4.0))
    h = np.mod(h, 360.0)

    s = np.where(cmax > 1e-6, delta / np.maximum(cmax, 1e-6), 0.0)
    v = cmax
    return h, s, v


def hsv_to_rgb_np(h: np.ndarray, s: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Convert H (0..360), S (0..1), V (0..1) back to float32 RGB [0..1]."""
    c = v * s
    x = c * (1.0 - np.abs((h / 60.0) % 2.0 - 1.0))
    m = v - c
    sector = (np.floor(h / 60.0).astype(np.int32)) % 6

    r = np.zeros_like(h)
    g = np.zeros_like(h)
    b = np.zeros_like(h)

    for sec, (rr, gg, bb) in enumerate([(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)]):
        mask = sector == sec
        r[mask] = rr[mask] if isinstance(rr, np.ndarray) else 0.0
        g[mask] = gg[mask] if isinstance(gg, np.ndarray) else 0.0
        b[mask] = bb[mask] if isinstance(bb, np.ndarray) else 0.0

    rgb = np.stack([r + m, g + m, b + m], axis=-1)
    return np.clip(rgb, 0.0, 1.0)


def dilate_mask(mask: np.ndarray, radius: int = 1) -> np.ndarray:
    cur = mask.copy()
    for _ in range(radius):
        padded = np.pad(cur, 1, mode="constant", constant_values=False)
        cur = (
            padded[1:-1, 1:-1]
            | padded[:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, :-2]
            | padded[1:-1, 2:]
            | padded[:-2, :-2]
            | padded[:-2, 2:]
            | padded[2:, :-2]
            | padded[2:, 2:]
        )
    return cur


def remove_chroma_green(im: Image.Image, aggressive_pockets: bool = True) -> Image.Image:
    """
    Border-seeded BFS + tight enclosed neon-chroma pocket removal + smooth edge feathering + green despill.
    Tightened enclosed-pocket threshold avoids punching holes in subtle shaded details (e.g., eyes).
    """
    rgb_u8 = np.array(im.convert("RGB"), dtype=np.uint8)
    rgb = rgb_u8.astype(np.float32) / 255.0
    h, w, _ = rgb.shape
    hue, sat, val = rgb_to_hsv_np(rgb)

    r_f = rgb_u8[..., 0].astype(np.float32)
    g_f = rgb_u8[..., 1].astype(np.float32)
    b_f = rgb_u8[..., 2].astype(np.float32)
    green_excess = g_f - np.maximum(r_f, b_f)

    # Exterior flood-fill candidates
    is_green_cand = (hue >= 70.0) & (hue <= 170.0) & (sat >= 0.26) & (val >= 0.20) & (green_excess >= 16.0)
    # Tight interior pocket seed: pure bright neon chroma green only
    is_pure_neon_green = (hue >= 88.0) & (hue <= 155.0) & (sat >= 0.44) & (val >= 0.28) & (green_excess >= 38.0)

    bg_mask = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_green_cand[y, x] and not bg_mask[y, x]:
                bg_mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if is_green_cand[y, x] and not bg_mask[y, x]:
                bg_mask[y, x] = True
                q.append((y, x))

    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg_mask[ny, nx] and is_green_cand[ny, nx]:
                bg_mask[ny, nx] = True
                q.append((ny, nx))

    if aggressive_pockets:
        pocket_seeds = is_pure_neon_green & (~bg_mask)
        py_idx, px_idx = np.where(pocket_seeds)
        for sy, sx in zip(py_idx.tolist(), px_idx.tolist()):
            if bg_mask[sy, sx]:
                continue
            bg_mask[sy, sx] = True
            q.append((sy, sx))
            while q:
                cy, cx = q.popleft()
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and not bg_mask[ny, nx] and is_green_cand[ny, nx]:
                        if green_excess[ny, nx] >= 26.0 and sat[ny, nx] >= 0.34:
                            bg_mask[ny, nx] = True
                            q.append((ny, nx))

    alpha = np.where(bg_mask, 0.0, 255.0).astype(np.float32)
    edge_zone = dilate_mask(bg_mask, 2) & (~bg_mask)
    soft_green = edge_zone & (green_excess > 6.0) & (hue >= 62.0) & (hue <= 176.0)
    ramp = np.clip(1.0 - (green_excess - 6.0) / 36.0, 0.0, 1.0)
    alpha[soft_green] = ramp[soft_green] * 255.0

    despill_zone = dilate_mask(bg_mask, 3) & (alpha > 0.0)
    out_rgb = rgb_u8.astype(np.float32)
    spill_mask = despill_zone & (out_rgb[..., 1] > np.maximum(out_rgb[..., 0], out_rgb[..., 2]))
    cap = 0.5 * (out_rgb[..., 0] + out_rgb[..., 2]) + 4.0
    out_rgb[..., 1] = np.where(spill_mask, np.minimum(out_rgb[..., 1], cap), out_rgb[..., 1])

    tiny_green = dilate_mask(bg_mask, 1) & (green_excess > 14.0) & (sat > 0.28)
    alpha[tiny_green] = np.minimum(alpha[tiny_green], 42.0)

    rgba = np.dstack([
        np.clip(out_rgb[..., 0], 0, 255),
        np.clip(out_rgb[..., 1], 0, 255),
        np.clip(out_rgb[..., 2], 0, 255),
        np.clip(alpha, 0, 255),
    ]).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def clean_stray_components(im: Image.Image, min_ratio: float = 0.004) -> Image.Image:
    arr = np.array(im)
    alpha = arr[..., 3]
    h, w = alpha.shape
    mask = alpha > 24

    mask[:2, :] = False
    mask[-2:, :] = False
    mask[:, :2] = False
    mask[:, -2:] = False

    visited = np.zeros_like(mask)
    comps: list[tuple[int, list[tuple[int, int]]]] = []

    ys, xs = np.where(mask)
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if visited[sy, sx]:
            continue
        q = deque([(sy, sx)])
        visited[sy, sx] = True
        pts = []
        while q:
            cy, cx = q.popleft()
            pts.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1),
                           (cy - 1, cx - 1), (cy - 1, cx + 1), (cy + 1, cx - 1), (cy + 1, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    q.append((ny, nx))
        comps.append((len(pts), pts))

    if not comps:
        return im
    max_area = max(c[0] for c in comps)
    keep = np.zeros_like(mask)
    for area, pts in comps:
        if area >= max(35, int(max_area * min_ratio)):
            for py, px in pts:
                keep[py, px] = True

    arr[..., 3] = np.where(keep, arr[..., 3], 0)
    return Image.fromarray(arr, mode="RGBA")


def crop_to_content(im: Image.Image, pad: int = 4) -> Image.Image:
    arr = np.array(im)
    ys, xs = np.where(arr[..., 3] > 16)
    if len(ys) == 0:
        return im
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(arr.shape[0], int(ys.max()) + 1 + pad)
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(arr.shape[1], int(xs.max()) + 1 + pad)
    return im.crop((x0, y0, x1, y1))


def split_2x2_sheet(sheet_rgba: Image.Image) -> list[Image.Image]:
    """Find cleanest natural split near center and extract [TL, TR, BL, BR] sprites."""
    arr = np.array(sheet_rgba)
    h, w, _ = arr.shape
    opaque = (arr[..., 3] > 28).astype(np.int32)

    col_sums = opaque.sum(axis=0)
    row_sums = opaque.sum(axis=1)

    x_lo, x_hi = int(w * 0.40), int(w * 0.60)
    y_lo, y_hi = int(h * 0.40), int(h * 0.60)
    mid_x = x_lo + int(np.argmin(col_sums[x_lo:x_hi]))
    mid_y = y_lo + int(np.argmin(row_sums[y_lo:y_hi]))

    cells = [
        sheet_rgba.crop((0, 0, mid_x, mid_y)),
        sheet_rgba.crop((mid_x, 0, w, mid_y)),
        sheet_rgba.crop((0, mid_y, mid_x, h)),
        sheet_rgba.crop((mid_x, mid_y, w, h)),
    ]
    return [crop_to_content(clean_stray_components(c), pad=4) for c in cells]


def apply_p2_palette(im: Image.Image, char_id: str) -> Image.Image:
    """Shift primary costume/accent colors in HSV while protecting natural anime skin tones."""
    arr = np.array(im.convert("RGBA"))
    rgb = arr[..., :3].astype(np.float32) / 255.0
    alpha = arr[..., 3]
    hue, sat, val = rgb_to_hsv_np(rgb)

    skin_mask = (hue >= 6.0) & (hue <= 44.0) & (sat <= 0.56) & (val >= 0.48)

    if char_id == "rin":
        target = (~skin_mask) & (alpha > 0) & ((hue <= 28.0) | (hue >= 318.0)) & (sat >= 0.28)
        new_hue = np.where(target, (hue + 218.0) % 360.0, hue)
        new_sat = np.where(target, np.clip(sat * 1.05, 0.0, 1.0), sat)
    else:
        target = (~skin_mask) & (alpha > 0) & (hue >= 175.0) & (hue <= 268.0) & (sat >= 0.22)
        new_hue = np.where(target, (hue + 148.0) % 360.0, hue)
        new_sat = np.where(target, np.clip(sat * 1.08, 0.0, 1.0), sat)

    new_rgb = (hsv_to_rgb_np(new_hue, new_sat, val) * 255.0).astype(np.uint8)
    out = np.dstack([new_rgb, alpha])
    return Image.fromarray(out, mode="RGBA")


def compute_foot_anchor(im: Image.Image) -> tuple[int, int]:
    arr = np.array(im)
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 32)
    if len(ys) == 0:
        return im.width // 2, im.height
    bottom_y = int(ys.max())
    top_y = int(ys.min())
    body_h = max(1, bottom_y - top_y)
    # Compute horizontal center of mass from lower-torso/hip/thigh band (42%..78% down),
    # which stays immune to uneven boot heights and extended horizontal weapons!
    band_top = top_y + int(body_h * 0.42)
    band_bot = top_y + int(body_h * 0.78)
    band_xs = xs[(ys >= band_top) & (ys <= band_bot)]
    anchor_x = int(np.median(band_xs)) if len(band_xs) > 0 else int(np.median(xs))
    return anchor_x, bottom_y


def crop_hud_bust(portrait_rgba: Image.Image, size: int = 256) -> Image.Image:
    arr = np.array(portrait_rgba)
    ys, xs = np.where(arr[..., 3] > 32)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    h = y1 - y0
    crop_h = int(h * 0.35)
    # Bias slightly left of horizontal bbox center since weapons extend right
    cx = x0 + int((x1 - x0) * 0.44)
    half = int(crop_h * 0.52)
    bx0 = max(0, cx - half)
    bx1 = min(portrait_rgba.width, cx + half)
    by0 = max(0, y0 - 6)
    by1 = min(portrait_rgba.height, by0 + (bx1 - bx0))
    bust = portrait_rgba.crop((bx0, by0, bx1, by1))
    return bust.resize((size, size), Image.Resampling.LANCZOS)


def process_character(char_id: str) -> None:
    print(f"[Sprites] Processing {char_id}...")
    sprite_dir = os.path.join(IMG_OUT, f"{char_id}_sprites")
    os.makedirs(sprite_dir, exist_ok=True)

    # 1. Master Portrait & HUD Bust
    portrait_raw = Image.open(os.path.join(RAW_DIR, f"{char_id}_portrait.png"))
    portrait_clean = crop_to_content(clean_stray_components(remove_chroma_green(portrait_raw)), pad=8)
    target_ph = 960
    p_scale = target_ph / portrait_clean.height
    portrait = portrait_clean.resize((int(round(portrait_clean.width * p_scale)), target_ph), Image.Resampling.LANCZOS)
    portrait.save(os.path.join(IMG_OUT, f"{char_id}_portrait.png"))

    portrait_p2 = apply_p2_palette(portrait, char_id)
    portrait_p2.save(os.path.join(IMG_OUT, f"{char_id}_portrait_p2.png"))

    hud = crop_hud_bust(portrait, 256)
    hud.save(os.path.join(IMG_OUT, f"{char_id}_hud.png"))
    apply_p2_palette(hud, char_id).save(os.path.join(IMG_OUT, f"{char_id}_hud_p2.png"))

    # 2. Cut-in banner (1280x420 crisp eye/face horizontal strip)
    cutin_raw = Image.open(os.path.join(RAW_DIR, f"{char_id}_cutin.png")).convert("RGB")
    cw, ch = cutin_raw.size
    target_crop_h = int(cw * (420.0 / 1280.0))
    cy_mid = int(ch * 0.45)
    y_top = max(0, cy_mid - target_crop_h // 2)
    y_bot = min(ch, y_top + target_crop_h)
    cutin = cutin_raw.crop((0, y_top, cw, y_bot)).resize((1280, 420), Image.Resampling.LANCZOS)
    cutin.save(os.path.join(IMG_OUT, f"{char_id}_cutin.png"))

    # 3. Extract 4 cells from sheet_a + 5th pose from portrait_clean
    raw_sheet = Image.open(os.path.join(RAW_DIR, f"{char_id}_sheet_a.png"))
    rgba_sheet = remove_chroma_green(raw_sheet)
    cells = split_2x2_sheet(rgba_sheet)

    if char_id == "rin":
        pose_dict = {
            "stance": cells[0],
            "guard": cells[1],
            "dash": cells[2],
            "aerial": cells[3],
            "thrust": portrait_clean,
        }
        portrait_target_h = 528.0
    else:
        pose_dict = {
            "stance": cells[0],
            "lunge": cells[1],
            "dash": cells[2],
            "aerial": cells[3],
            "heroic": portrait_clean,
        }
        # Lia's spear tip rises above her head, so total bbox height is taller than standing body
        portrait_target_h = 595.0

    stance_h = max(100, pose_dict["stance"].height)
    base_scale = 520.0 / float(stance_h)

    meta: dict[str, dict] = {}
    for pose_name, cell in pose_dict.items():
        if pose_name in ("thrust", "heroic"):
            pose_scale = portrait_target_h / float(max(100, cell.height))
        else:
            pose_scale = base_scale
            scaled_h = cell.height * pose_scale
            if scaled_h > 620.0:
                pose_scale *= 600.0 / scaled_h
            elif scaled_h < 420.0:
                pose_scale *= 455.0 / scaled_h

        nw = max(16, int(round(cell.width * pose_scale)))
        nh = max(16, int(round(cell.height * pose_scale)))
        resized = cell.resize((nw, nh), Image.Resampling.LANCZOS)
        resized_p2 = apply_p2_palette(resized, char_id)

        f1 = f"{pose_name}.png"
        f2 = f"{pose_name}_p2.png"
        resized.save(os.path.join(sprite_dir, f1))
        resized_p2.save(os.path.join(sprite_dir, f2))

        ax, ay = compute_foot_anchor(resized)
        meta[pose_name] = {
            "file": f1,
            "fileP2": f2,
            "width": nw,
            "height": nh,
            "anchorX": ax,
            "anchorY": ay,
        }
        print(f"    {pose_name:12s} -> {nw}x{nh} anchor=({ax},{ay})")

    with open(os.path.join(sprite_dir, "meta.json"), "w", encoding="utf-8") as fp:
        json.dump(meta, fp, indent=2)


def process_stage_and_keyart() -> None:
    print("[Sprites] Processing Key Art & Stage layers...")
    keyart = Image.open(os.path.join(RAW_DIR, "keyart_title.png")).convert("RGB")
    keyart.resize((1920, 1080), Image.Resampling.LANCZOS).save(os.path.join(IMG_OUT, "keyart_title.png"))

    sky = Image.open(os.path.join(RAW_DIR, "stage_sky.png")).convert("RGB")
    sky.resize((1920, 1080), Image.Resampling.LANCZOS).save(os.path.join(IMG_OUT, "stage_sky.png"))

    floor = Image.open(os.path.join(RAW_DIR, "stage_floor.png")).convert("RGB")
    floor.resize((1024, 1024), Image.Resampling.LANCZOS).save(os.path.join(IMG_OUT, "stage_floor.png"))

    mid_raw = Image.open(os.path.join(RAW_DIR, "stage_midground.png"))
    mid_rgba = remove_chroma_green(mid_raw, aggressive_pockets=True)
    arr = np.array(mid_rgba)
    arr[-4:, :, 3] = 0
    mid_clean = Image.fromarray(arr, mode="RGBA").resize((1920, 1080), Image.Resampling.LANCZOS)
    mid_clean.save(os.path.join(IMG_OUT, "stage_midground.png"))
    print("[Sprites] Stage & Key Art processed!")


if __name__ == "__main__":
    process_stage_and_keyart()
    process_character("rin")
    process_character("lia")
    print("[Sprites] ALL sprite & stage assets processed successfully!")
