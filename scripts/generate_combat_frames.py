import json
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from process_sprites import apply_p2_palette
from generate_locomotion_frames import (
    apply_upper_lean,
    crop_and_anchor,
    pad_sprite,
    smoothstep,
    warp_rgba,
)

IMG_OUT = os.path.join("public", "assets", "images")
RAW_DIR = "raw_assets"


def drop_and_lean_grounded(
    im: Image.Image,
    anchor_x: int,
    anchor_y: int,
    y_hip: float,
    y_knee: float,
    y_foot: float,
    x_split: float,
    drop_px: float,
    lean_rad: float,
    knee_bow: float = 20.0,
    front_foot_dx: float = 0.0,
    back_foot_dx: float = 0.0,
    min_leg_x: float = 0.0,
) -> tuple[Image.Image, int, int]:
    """
    Lower and/or lean upper body rigidly (1:1 undistorted head/weapon!) while
    compressing legs smoothly down to pinned boots on the floor.
    """
    pad_arr, px, py = pad_sprite(im, pad_x=130, pad_top=70, pad_bot=55)
    h, w, _ = pad_arr.shape
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)

    ax_c = anchor_x + px
    ay_c = anchor_y + py
    hip_out_y = py + y_hip + drop_px

    w_up_out = 1.0 - smoothstep(hip_out_y - 24.0, hip_out_y + 18.0, Y)
    if min_leg_x > 0:
        diag_x = px + min_leg_x - 0.82 * np.maximum(0.0, Y - hip_out_y)
        w_leg_guard = smoothstep(diag_x - 5.0, diag_x + 5.0, X)
        w_body_out = np.maximum(w_up_out, 1.0 - w_leg_guard)
    else:
        w_leg_guard = np.ones_like(X)
        w_body_out = w_up_out

    lean_dx, lean_dy = apply_upper_lean(X, Y, ax_c, hip_out_y, lean_rad, w_body_out)
    dy_leg_grad = drop_px * (1.0 - smoothstep(hip_out_y - 6.0, py + y_foot - 14.0, Y))

    knee_y_out = py + y_knee + drop_px * 0.45
    w_knee_out = (
        np.exp(-((Y - knee_y_out) / 48.0) ** 2)
        * smoothstep(hip_out_y - 8.0, hip_out_y + 22.0, Y)
        * w_leg_guard
    )
    split_c = px + x_split
    w_left_all = (1.0 - smoothstep(split_c - 20.0, split_c + 20.0, X)) * smoothstep(hip_out_y - 8.0, py + y_foot - 12.0, Y) * w_leg_guard
    w_right_all = smoothstep(split_c - 20.0, split_c + 20.0, X) * smoothstep(hip_out_y - 8.0, py + y_foot - 12.0, Y) * w_leg_guard

    w_l_knee = (1.0 - smoothstep(split_c - 20.0, split_c + 20.0, X)) * w_knee_out
    w_r_knee = smoothstep(split_c - 20.0, split_c + 20.0, X) * w_knee_out

    dx = (
        (-knee_bow * w_l_knee + knee_bow * w_r_knee)
        + back_foot_dx * w_left_all
        + front_foot_dx * w_right_all
        + lean_dx
    )
    dy = drop_px * w_body_out + dy_leg_grad * (1.0 - w_body_out) + lean_dy
    warped = warp_rgba(pad_arr, dx, dy)
    return crop_and_anchor(warped, ax_c, ay_c, grounded=True)


def rotate_air_pose(
    im: Image.Image,
    anchor_x: int,
    anchor_y: int,
    pivot_rel_y: float,
    angle_rad: float,
    hair_dy: float = 0.0,
) -> tuple[Image.Image, int, int]:
    """Exact rigid rotation around center of mass with zero scaling artifacts."""
    # Add subtle trailing hair wave before exact rigid rotation
    pad_arr, px, py = pad_sprite(im, pad_x=40, pad_top=40, pad_bot=40)
    h, w, _ = pad_arr.shape
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    ax_c = anchor_x + px
    if abs(hair_dy) > 0.1:
        w_trail = 1.0 - smoothstep(ax_c - 90.0, ax_c + 10.0, X)
        pad_arr = warp_rgba(pad_arr, np.zeros_like(X), hair_dy * w_trail)

    # Embed inside centered canvas around pivot so Image.rotate preserves exact anchor offset
    src_im = Image.fromarray(pad_arr, mode="RGBA")
    # Pivot inside src_im
    piv_x = anchor_x + px
    piv_y = anchor_y + py + pivot_rel_y
    # Pad symmetrically around pivot so rotation center == pivot
    rad = max(piv_x, src_im.width - piv_x, piv_y, src_im.height - piv_y) + 32
    sq = Image.new("RGBA", (int(rad * 2), int(rad * 2)), (0, 0, 0, 0))
    sq.paste(src_im, (int(rad - piv_x), int(rad - piv_y)), src_im)

    # Pillow rotates counterclockwise for positive degrees; positive angle_rad = lean forward (clockwise)
    deg = -math.degrees(angle_rad)
    rot_sq = sq.rotate(deg, resample=Image.Resampling.BICUBIC, expand=False)
    rot_arr = np.array(rot_sq)
    # Foot anchor rotated around center (rad, rad)
    ca, sa = math.cos(angle_rad), math.sin(angle_rad)
    foot_dx = (anchor_x + px) - piv_x
    foot_dy = (anchor_y + py) - piv_y
    rot_ax = rad + foot_dx * ca - foot_dy * sa
    rot_ay = rad + foot_dx * sa + foot_dy * ca
    return crop_and_anchor(rot_arr, rot_ax, rot_ay, grounded=False)


def build_grounded_recoil(
    im: Image.Image,
    anchor_x: int,
    anchor_y: int,
    angle_deg: float,
    squash_x: float = 1.0,
    squash_y: float = 1.0,
    rear_pivot_dx: float = -45.0,
    shift_x: float = 0.0,
) -> tuple[Image.Image, int, int]:
    """
    Create a completely coherent, kink-free grounded recoil pose by uniformly
    scaling the intact body/weapon sprite and rotating rigidly around the rear ankle.
    Positive angle_deg rotates counterclockwise (head/torso whipping backward).
    """
    if abs(squash_x - 1.0) > 1e-3 or abs(squash_y - 1.0) > 1e-3:
        new_w = max(1, int(round(im.width * squash_x)))
        new_h = max(1, int(round(im.height * squash_y)))
        src = im.resize((new_w, new_h), resample=Image.Resampling.BICUBIC)
        sax = anchor_x * squash_x
        say = anchor_y * squash_y
    else:
        src = im.convert("RGBA")
        sax = float(anchor_x)
        say = float(anchor_y)

    piv_x = sax + rear_pivot_dx
    piv_y = say - 12.0
    rad = int(math.ceil(max(piv_x, src.width - piv_x, piv_y, src.height - piv_y))) + 48
    sq = Image.new("RGBA", (rad * 2, rad * 2), (0, 0, 0, 0))
    sq.paste(src, (int(round(rad - piv_x)), int(round(rad - piv_y))), src)

    rot_sq = sq.rotate(angle_deg, resample=Image.Resampling.BICUBIC, expand=False)
    rot_arr = np.array(rot_sq)
    # Rotating foot anchor counterclockwise by +angle_deg
    th = -math.radians(angle_deg)
    ca, sa = math.cos(th), math.sin(th)
    dx = sax - piv_x
    dy = say - piv_y
    rot_ax = rad + dx * ca - dy * sa + shift_x
    rot_ay = rad + dx * sa + dy * ca
    out_im, out_ax, out_ay = crop_and_anchor(rot_arr, rot_ax, rot_ay, grounded=True)
    return out_im, out_ax, out_ay


def _lay_flat_pose(
    im: Image.Image,
    y_hip: float,
    rot_deg: float,
    flatten_y: float,
    stretch_x: float,
    converge_legs: bool = False,
    x_split: float = 188.0,
    y_foot: float = 530.0,
) -> tuple[Image.Image, int, int]:
    """
    Lay fighter completely flat (0 deg horizontal) along the stone floor:
    optionally converges wide stance legs, rotates +96 deg CCW so head and boots
    rest level, applies gravity settle resize, and tucks loose hair/cape tips up
    onto the horizontal floor line so anchorY sits directly under back/hips/heels.
    """
    pad_arr, px, py = pad_sprite(im, pad_x=72, pad_top=48, pad_bot=48)
    h, w, _ = pad_arr.shape
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    piv_y = py + y_hip

    if converge_legs:
        split_c = px + x_split
        y_foot_c = py + y_foot
        w_y = smoothstep(piv_y - 14.0, y_foot_c - 18.0, Y)
        w_right = smoothstep(split_c - 16.0, split_c + 48.0, X)
        w_left = 1.0 - smoothstep(split_c - 22.0, split_c + 14.0, X)
        dx_conv = (-116.0 * w_right + 28.0 * w_left) * w_y
        dy_conv = (-12.0 * w_right) * w_y
        base_arr = warp_rgba(pad_arr, dx_conv, dy_conv)
    else:
        w_lower = smoothstep(piv_y - 10.0, piv_y + 130.0, Y)
        base_arr = warp_rgba(pad_arr, 24.0 * w_lower, -16.0 * w_lower)

    base_im = Image.fromarray(base_arr, mode="RGBA")
    fallen_im = base_im.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)

    sw = max(1, int(round(fallen_im.width * stretch_x)))
    sh = max(1, int(round(fallen_im.height * flatten_y)))
    flat_im = fallen_im.resize((sw, sh), resample=Image.Resampling.BICUBIC)
    arr = np.array(flat_im)

    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 28)
    if len(ys) == 0:
        return flat_im, sw // 2, sh - 4

    x0_b, x1_b = int(xs.min()), int(xs.max())
    bw = max(1, x1_b - x0_b)

    # Gently tuck loose left hair ribbons & lower drape up so silhouette looks grounded on flat stone
    ah, aw, _ = arr.shape
    YY, XX = np.mgrid[0:ah, 0:aw].astype(np.float32)
    y_body_ref = int(np.percentile(ys[(xs >= x0_b + bw * 0.20) & (xs <= x0_b + bw * 0.65)], 68)) if bw > 20 else int(np.percentile(ys, 70))
    if int(ys.max()) > y_body_ref + 16:
        w_hang_x = 1.0 - smoothstep(x0_b + bw * 0.35, x0_b + bw * 0.72, XX)
        below = np.maximum(0.0, YY - float(y_body_ref - 14))
        dy_settle = -0.58 * below * w_hang_x
        arr = warp_rgba(arr, np.zeros_like(XX), dy_settle)
        alpha = arr[..., 3]
        ys, xs = np.where(alpha > 28)

    pad = 4
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(arr.shape[1], int(xs.max()) + 1 + pad)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(arr.shape[0], int(ys.max()) + 1 + pad)
    crop = Image.fromarray(arr[y0:y1, x0:x1], mode="RGBA")
    body_ax = int(np.median(xs)) - x0

    # Pin anchorY right under the resting torso/back/hip plane (not suspended by a dangling sleeve, hand, or spear tip!)
    crop_bw = max(1, int(xs.max()) - int(xs.min()))
    torso_mask = (xs >= int(xs.min()) + crop_bw * 0.16) & (xs <= int(xs.min()) + crop_bw * 0.66)
    torso_floor = int(np.percentile(ys[torso_mask], 76)) if np.any(torso_mask) else int(np.percentile(ys, 80))
    body_ay = min(int(ys.max()) - y0, max(torso_floor - y0, int(ys.max()) - y0 - 48))
    return crop, body_ax, body_ay


def build_knockdown_ground(
    im: Image.Image,
    anchor_x: int,
    anchor_y: int,
    y_hip: float,
    converge_legs: bool = False,
    x_split: float = 188.0,
    y_foot: float = 530.0,
    rot_deg: float = 95.0,
) -> tuple[Image.Image, int, int]:
    """Completely flat lying-down rest pose parallel to the shrine floor."""
    return _lay_flat_pose(
        im,
        y_hip=y_hip,
        rot_deg=rot_deg,
        flatten_y=0.85,
        stretch_x=1.04,
        converge_legs=converge_legs,
        x_split=x_split,
        y_foot=y_foot,
    )


def build_knockdown_slam(
    im: Image.Image,
    anchor_x: int,
    anchor_y: int,
    y_hip: float,
    converge_legs: bool = False,
    x_split: float = 188.0,
    y_foot: float = 530.0,
    rot_deg: float = 97.0,
) -> tuple[Image.Image, int, int]:
    """Flattened floor-impact bounce pose on first slam into stone tiles."""
    return _lay_flat_pose(
        im,
        y_hip=y_hip,
        rot_deg=rot_deg,
        flatten_y=0.72,
        stretch_x=1.09,
        converge_legs=converge_legs,
        x_split=x_split,
        y_foot=y_foot,
    )


def measure_weapon_tip(im: Image.Image, ax: int, ay: int) -> tuple[int, int]:
    a = np.array(im)[..., 3] > 36
    ys, xs = np.where(a)
    if len(xs) == 0:
        return 180, -240
    max_x = int(xs.max())
    tip_ys = ys[xs >= max_x - 14]
    tip_y = int(np.median(tip_ys))
    return max_x - ax, tip_y - ay


def generate_character_combat(char_id: str) -> None:
    print(f"[CombatFrames] Generating 22 dedicated combat/damage poses for {char_id}...")
    sprite_dir = os.path.join(IMG_OUT, f"{char_id}_sprites")
    meta_path = os.path.join(sprite_dir, "meta.json")
    with open(meta_path, "r", encoding="utf-8") as fp:
        meta = json.load(fp)

    def load(name: str) -> tuple[Image.Image, int, int]:
        info = meta[name]
        return (
            Image.open(os.path.join(sprite_dir, info["file"])).convert("RGBA"),
            int(info["anchorX"]),
            int(info["anchorY"]),
        )

    stance_im, st_ax, st_ay = load("stance")
    dash_im, da_ax, da_ay = load("dash")
    aerial_im, ae_ax, ae_ay = load("aerial")
    crouch_im, cr_ax, cr_ay = load("crouch_0")

    poses: dict[str, tuple[Image.Image, int, int]] = {}

    if char_id == "rin":
        thrust_im, th_ax, th_ay = load("thrust")
        guard_im, gu_ax, gu_ay = load("guard")

        # 10 Dedicated Attack & Special Poses
        poses["atk_windup"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 292, 402, 514, 204,
            drop_px=18.0, lean_rad=-0.17, knee_bow=14.0, back_foot_dx=-10.0
        )
        poses["atk_light"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 292, 402, 514, 204,
            drop_px=12.0, lean_rad=0.14, knee_bow=12.0, front_foot_dx=22.0
        )
        poses["atk_mid"] = drop_and_lean_grounded(
            thrust_im, th_ax, th_ay, 290, 400, 520, 162,
            drop_px=16.0, lean_rad=0.11, knee_bow=14.0, front_foot_dx=24.0
        )
        poses["atk_heavy_prep"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 292, 402, 514, 204,
            drop_px=34.0, lean_rad=-0.20, knee_bow=24.0, back_foot_dx=-16.0
        )
        poses["atk_heavy_cleave"] = drop_and_lean_grounded(
            thrust_im, th_ax, th_ay, 290, 400, 520, 162,
            drop_px=44.0, lean_rad=0.22, knee_bow=28.0, front_foot_dx=36.0, back_foot_dx=-18.0
        )
        poses["atk_crouch_low"] = drop_and_lean_grounded(
            crouch_im, cr_ax, cr_ay, 260, 360, 455, 207,
            drop_px=18.0, lean_rad=0.16, knee_bow=20.0, front_foot_dx=32.0
        )
        poses["atk_crouch_up"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 292, 402, 514, 204,
            drop_px=14.0, lean_rad=-0.16, knee_bow=18.0, front_foot_dx=22.0
        )
        poses["atk_air_slash"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -220, 0.22, hair_dy=-14.0)
        poses["atk_special_up"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -240, -0.24, hair_dy=18.0)
        poses["atk_special_fwd"] = rotate_air_pose(dash_im, da_ax, da_ay, -200, 0.14, hair_dy=-10.0)

        # 12 Detailed, Anatomically Coherent Hurt, Flat Knockdown, Slam & Wakeup Poses for Rin
        poses["hurt_snap"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=13.5, squash_x=1.01, squash_y=0.98, rear_pivot_dx=-50.0, shift_x=18.0)
        poses["hurt_heavy"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=10.5, squash_x=1.04, squash_y=0.93, rear_pivot_dx=-50.0, shift_x=14.0)
        poses["hurt_reel_1"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=11.5, squash_x=1.05, squash_y=0.92, rear_pivot_dx=-50.0, shift_x=16.0)
        poses["hurt_light"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=8.5, squash_x=1.02, squash_y=0.96, rear_pivot_dx=-50.0, shift_x=10.0)
        poses["hurt_reel_2"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=6.0, squash_x=1.02, squash_y=0.96, rear_pivot_dx=-50.0, shift_x=7.0)
        poses["hurt_recover"] = build_grounded_recoil(guard_im, gu_ax, gu_ay, angle_deg=2.8, squash_x=1.01, squash_y=0.98, rear_pivot_dx=-50.0, shift_x=3.0)
        poses["hurt_air_up"] = rotate_air_pose(guard_im, gu_ax, gu_ay, -230, -0.34, hair_dy=28.0)
        poses["hurt_air"] = rotate_air_pose(guard_im, gu_ax, gu_ay, -230, -0.52, hair_dy=22.0)
        poses["hurt_air_down"] = rotate_air_pose(guard_im, gu_ax, gu_ay, -230, -0.88, hair_dy=-18.0)
        poses["knockdown_slam"] = build_knockdown_slam(guard_im, gu_ax, gu_ay, 298, converge_legs=True, x_split=188.0, y_foot=534.0, rot_deg=93.5)
        poses["knockdown_ground"] = build_knockdown_ground(guard_im, gu_ax, gu_ay, 298, converge_legs=True, x_split=188.0, y_foot=534.0, rot_deg=91.5)
        poses["wakeup_rise"] = drop_and_lean_grounded(
            crouch_im, cr_ax, cr_ay, 260, 360, 455, 207,
            drop_px=24.0, lean_rad=0.18, knee_bow=20.0
        )
    else:
        lunge_im, lu_ax, lu_ay = load("lunge")
        heroic_im, he_ax, he_ay = load("heroic")

        # 10 Dedicated Attack & Special Poses for Lia
        poses["atk_windup"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 318, 418, 515, 228,
            drop_px=16.0, lean_rad=-0.16, knee_bow=12.0, back_foot_dx=-10.0, min_leg_x=144.0
        )
        poses["atk_light"] = drop_and_lean_grounded(
            lunge_im, lu_ax, lu_ay, 290, 390, 485, 264,
            drop_px=8.0, lean_rad=0.10, knee_bow=12.0, front_foot_dx=22.0
        )
        poses["atk_mid"] = drop_and_lean_grounded(
            lunge_im, lu_ax, lu_ay, 290, 390, 485, 264,
            drop_px=18.0, lean_rad=0.16, knee_bow=18.0, front_foot_dx=34.0, back_foot_dx=-12.0
        )
        poses["atk_heavy_prep"] = drop_and_lean_grounded(
            heroic_im, he_ax, he_ay, 340, 455, 588, 125,
            drop_px=28.0, lean_rad=-0.18, knee_bow=20.0, back_foot_dx=-14.0
        )
        poses["atk_heavy_cleave"] = drop_and_lean_grounded(
            lunge_im, lu_ax, lu_ay, 290, 390, 485, 264,
            drop_px=38.0, lean_rad=0.22, knee_bow=26.0, front_foot_dx=42.0, back_foot_dx=-18.0
        )
        poses["atk_crouch_low"] = drop_and_lean_grounded(
            lunge_im, lu_ax, lu_ay, 290, 390, 485, 264,
            drop_px=52.0, lean_rad=0.14, knee_bow=28.0, front_foot_dx=30.0
        )
        poses["atk_crouch_up"] = drop_and_lean_grounded(
            stance_im, st_ax, st_ay, 318, 418, 515, 228,
            drop_px=14.0, lean_rad=-0.16, knee_bow=18.0, front_foot_dx=20.0, min_leg_x=144.0
        )
        poses["atk_air_slash"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -220, 0.22, hair_dy=-14.0)
        poses["atk_special_up"] = rotate_air_pose(dash_im, da_ax, da_ay, -195, 0.08, hair_dy=0.0)
        poses["atk_special_fwd"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -220, 0.34, hair_dy=-20.0)

        # 12 Detailed, Anatomically Coherent Hurt, Flat Knockdown, Slam & Wakeup Poses for Lia (zero spear kink!)
        poses["hurt_snap"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=13.5, squash_x=1.01, squash_y=0.98, rear_pivot_dx=-42.0, shift_x=18.0)
        poses["hurt_heavy"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=10.5, squash_x=1.04, squash_y=0.93, rear_pivot_dx=-42.0, shift_x=14.0)
        poses["hurt_reel_1"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=11.5, squash_x=1.05, squash_y=0.92, rear_pivot_dx=-42.0, shift_x=16.0)
        poses["hurt_light"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=8.5, squash_x=1.02, squash_y=0.96, rear_pivot_dx=-42.0, shift_x=10.0)
        poses["hurt_reel_2"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=6.0, squash_x=1.02, squash_y=0.96, rear_pivot_dx=-42.0, shift_x=7.0)
        poses["hurt_recover"] = build_grounded_recoil(stance_im, st_ax, st_ay, angle_deg=2.8, squash_x=1.01, squash_y=0.98, rear_pivot_dx=-42.0, shift_x=3.0)
        poses["hurt_air_up"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -230, -0.34, hair_dy=28.0)
        poses["hurt_air"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -230, -0.52, hair_dy=24.0)
        poses["hurt_air_down"] = rotate_air_pose(aerial_im, ae_ax, ae_ay, -230, -0.88, hair_dy=-18.0)
        poses["knockdown_slam"] = build_knockdown_slam(heroic_im, he_ax, he_ay, 330, converge_legs=False)
        poses["knockdown_ground"] = build_knockdown_ground(heroic_im, he_ax, he_ay, 330, converge_legs=False)
        poses["wakeup_rise"] = drop_and_lean_grounded(
            crouch_im, cr_ax, cr_ay, 275, 368, 444, 265,
            drop_px=24.0, lean_rad=0.18, knee_bow=20.0, min_leg_x=144.0
        )

    for pose_name, (im, ax, ay) in poses.items():
        f1 = f"{pose_name}.png"
        f2 = f"{pose_name}_p2.png"
        im.save(os.path.join(sprite_dir, f1))
        apply_p2_palette(im, char_id).save(os.path.join(sprite_dir, f2))
        meta[pose_name] = {
            "file": f1,
            "fileP2": f2,
            "width": im.width,
            "height": im.height,
            "anchorX": ax,
            "anchorY": ay,
        }
        tx, ty = measure_weapon_tip(im, ax, ay)
        print(f"    {pose_name:18s}: {im.width}x{im.height} anchor=({ax},{ay}) tip_rel=({tx:+d},{ty:+d})")

    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(meta, fp, indent=2)

    # Diagnostic contact sheet
    ordered = list(poses.keys())
    cell_w, cell_h = 560, 650
    strip = Image.new("RGBA", (cell_w * len(ordered), cell_h), (16, 18, 34, 255))
    draw = ImageDraw.Draw(strip)
    floor_y = 600
    draw.line([(0, floor_y), (strip.width, floor_y)], fill=(255, 42, 160, 255), width=4)
    for idx, name in enumerate(ordered):
        im, ax, ay = poses[name]
        cx = idx * cell_w + cell_w // 2
        draw.line([(cx, 30), (cx, floor_y)], fill=(70, 90, 140, 180), width=2)
        strip.paste(im, (cx - ax, floor_y - ay), im)
        draw.text((idx * cell_w + 18, 16), name, fill=(255, 220, 100, 255))

    debug_path = os.path.join(RAW_DIR, f"debug_combat_{char_id}.png")
    strip.convert("RGB").save(debug_path)
    print(f"  -> Wrote 22 combat/damage poses + {debug_path}")


if __name__ == "__main__":
    generate_character_combat("rin")
    generate_character_combat("lia")
    print("[CombatFrames] Done!")
