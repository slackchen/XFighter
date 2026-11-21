import json
import math
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

# Reuse our verified P2 palette shifter from process_sprites.py
sys.path.insert(0, os.path.dirname(__file__))
from process_sprites import apply_p2_palette

IMG_OUT = os.path.join("public", "assets", "images")
RAW_DIR = "raw_assets"


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def warp_rgba(arr_u8: np.ndarray, dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """
    Smooth premultiplied-alpha bilinear inverse warp.
    Output pixel (y, x) samples from source (y - dy[y, x], x - dx[y, x]).
    """
    h, w, _ = arr_u8.shape
    alpha = arr_u8[..., 3:4].astype(np.float32) / 255.0
    rgb = arr_u8[..., :3].astype(np.float32) * alpha
    premult = np.concatenate([rgb, alpha], axis=-1)

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xx - dx, 0.0, w - 1.001)
    sy = np.clip(yy - dy, 0.0, h - 1.001)

    x0 = np.floor(sx).astype(np.int32)
    y0 = np.floor(sy).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)

    wx = (sx - x0)[..., None]
    wy = (sy - y0)[..., None]

    v00 = premult[y0, x0]
    v10 = premult[y0, x1]
    v01 = premult[y1, x0]
    v11 = premult[y1, x1]

    top = v00 * (1.0 - wx) + v10 * wx
    bot = v01 * (1.0 - wx) + v11 * wx
    interp = top * (1.0 - wy) + bot * wy

    out_a = np.clip(interp[..., 3], 0.0, 1.0)
    safe_a = np.maximum(out_a[..., None], 1e-4)
    out_rgb = np.where(out_a[..., None] > 0.01, interp[..., :3] / safe_a, 0.0)

    rgba = np.dstack([
        np.clip(out_rgb[..., 0], 0.0, 255.0),
        np.clip(out_rgb[..., 1], 0.0, 255.0),
        np.clip(out_rgb[..., 2], 0.0, 255.0),
        np.clip(out_a * 255.0, 0.0, 255.0),
    ]).astype(np.uint8)
    return rgba


def pad_sprite(im: Image.Image, pad_x: int = 96, pad_top: int = 48, pad_bot: int = 36) -> tuple[np.ndarray, int, int]:
    arr = np.array(im.convert("RGBA"))
    h, w, _ = arr.shape
    canvas = np.zeros((h + pad_top + pad_bot, w + pad_x * 2, 4), dtype=np.uint8)
    canvas[pad_top:pad_top + h, pad_x:pad_x + w] = arr
    return canvas, pad_x, pad_top


def crop_and_anchor(
    warped: np.ndarray,
    orig_ax_in_canvas: float,
    orig_ay_in_canvas: float,
    grounded: bool = True,
) -> tuple[Image.Image, int, int]:
    alpha = warped[..., 3]
    ys, xs = np.where(alpha > 28)
    if len(ys) == 0:
        im = Image.fromarray(warped, mode="RGBA")
        return im, im.width // 2, im.height - 1

    pad = 4
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(warped.shape[1], int(xs.max()) + 1 + pad)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(warped.shape[0], int(ys.max()) + 1 + pad)

    cropped = Image.fromarray(warped[y0:y1, x0:x1], mode="RGBA")
    ax = int(round(orig_ax_in_canvas - x0))
    if grounded:
        # Pin anchorY to exact bottom-most visible boot pixel
        ay = int(ys.max()) - y0
    else:
        ay = int(round(orig_ay_in_canvas - y0))
    return cropped, ax, ay


def build_rig_masks(
    shape_hw: tuple[int, int],
    px: int,
    py: int,
    y_hip: float,
    y_knee: float,
    y_foot: float,
    x_split: float,
    min_leg_x: float = 0.0,
) -> dict[str, np.ndarray]:
    h, w = shape_hw
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)

    cy_hip = py + y_hip
    cy_knee = py + y_knee
    cy_foot = py + y_foot
    cx_split = px + x_split
    cmin_leg_x = px + min_leg_x

    # Smooth vertical regions
    w_upper = 1.0 - smoothstep(cy_hip - 36.0, cy_hip + 28.0, Y)
    if min_leg_x > 0:
        # Follow exact diagonal gap between Lia's lower-left spear/coat and her left leg in output space
        diag_guard_x = cmin_leg_x - 0.65 * np.maximum(0.0, Y - (cy_hip + 52.0))
        w_leg_x_guard = smoothstep(diag_guard_x - 6.0, diag_guard_x + 6.0, X)
        w_rigid_body = np.maximum(w_upper, 1.0 - w_leg_x_guard)
    else:
        w_leg_x_guard = np.ones_like(X)
        w_rigid_body = w_upper
    w_leg = smoothstep(cy_hip - 22.0, cy_hip + 34.0, Y) * w_leg_x_guard
    w_knee_bell = np.exp(-((Y - cy_knee) / 56.0) ** 2)
    w_foot_zone = smoothstep(cy_foot - 95.0, cy_foot - 18.0, Y)
    w_head = 1.0 - smoothstep(py + y_hip * 0.42, py + y_hip * 0.68, Y)

    # Left vs Right leg separation
    w_left_leg = (1.0 - smoothstep(cx_split - 22.0, cx_split + 22.0, X)) * w_leg
    w_right_leg = smoothstep(cx_split - 22.0, cx_split + 22.0, X) * w_leg

    # Soft leg vertical weight that goes to 0 above hip and peaks at foot
    w_leg_stride = smoothstep(cy_hip - 12.0, cy_foot - 28.0, Y) * w_leg_x_guard
    w_left_stride = (1.0 - smoothstep(cx_split - 22.0, cx_split + 22.0, X)) * w_leg_stride
    w_right_stride = smoothstep(cx_split - 22.0, cx_split + 22.0, X) * w_leg_stride

    # Trailing hair / sash weight (left side behind torso)
    w_hair_trail = (1.0 - smoothstep(px + x_split - 85.0, px + x_split - 15.0, X)) * (1.0 - smoothstep(cy_hip - 20.0, cy_hip + 65.0, Y))

    return {
        "X": X,
        "Y": Y,
        "cy_hip": np.array(cy_hip, dtype=np.float32),
        "cy_knee": np.array(cy_knee, dtype=np.float32),
        "cy_foot": np.array(cy_foot, dtype=np.float32),
        "w_upper": w_upper,
        "w_rigid_body": w_rigid_body,
        "w_leg": w_leg,
        "w_knee_bell": w_knee_bell,
        "w_foot_zone": w_foot_zone,
        "w_head": w_head,
        "w_left_leg": w_left_leg,
        "w_right_leg": w_right_leg,
        "w_left_stride": w_left_stride,
        "w_right_stride": w_right_stride,
        "w_hair_trail": w_hair_trail,
    }


def apply_upper_lean(
    X: np.ndarray,
    Y: np.ndarray,
    pivot_x: float,
    pivot_y: float,
    angle_rad: float,
    weight: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    ca, sa = math.cos(angle_rad), math.sin(angle_rad)
    rx = X - pivot_x
    ry = Y - pivot_y
    nx = rx * ca - ry * sa + pivot_x
    ny = rx * sa + ry * ca + pivot_y
    return (nx - X) * weight, (ny - Y) * weight


def generate_character_locomotion(char_id: str) -> None:
    print(f"[Locomotion] Generating 28 grounded locomotion frames for {char_id}...")
    sprite_dir = os.path.join(IMG_OUT, f"{char_id}_sprites")
    meta_path = os.path.join(sprite_dir, "meta.json")
    with open(meta_path, "r", encoding="utf-8") as fp:
        meta = json.load(fp)

    stance_im = Image.open(os.path.join(sprite_dir, "stance.png"))
    dash_im = Image.open(os.path.join(sprite_dir, "dash.png"))
    aerial_im = Image.open(os.path.join(sprite_dir, "aerial.png"))
    back_src_name = "guard.png" if char_id == "rin" else "heroic.png"
    back_im = Image.open(os.path.join(sprite_dir, back_src_name))

    stance_info = meta["stance"]
    dash_info = meta["dash"]
    aerial_info = meta["aerial"]
    back_info = meta["guard" if char_id == "rin" else "heroic"]

    if char_id == "rin":
        cfg = {
            "y_hip": 292.0,
            "y_knee": 402.0,
            "y_foot": 514.0,
            "x_split": 204.0,
            "min_leg_x": 0.0,
            "dash_hip": 268.0,
            "dash_split": 224.0,
        }
    else:
        cfg = {
            "y_hip": 318.0,
            "y_knee": 418.0,
            "y_foot": 515.0,
            "x_split": 228.0,
            "min_leg_x": 144.0,  # Protect Lia's diagonal spear shaft & coat hem so spear stays laser-straight!
            "dash_hip": 255.0,
            "dash_split": 240.0,
        }

    st_pad, st_px, st_py = pad_sprite(stance_im, pad_x=105, pad_top=52, pad_bot=40)
    st_rig = build_rig_masks(
        st_pad.shape[:2], st_px, st_py,
        cfg["y_hip"], cfg["y_knee"], cfg["y_foot"], cfg["x_split"], cfg["min_leg_x"]
    )
    st_ax = stance_info["anchorX"] + st_px
    st_ay = stance_info["anchorY"] + st_py

    da_pad, da_px, da_py = pad_sprite(dash_im, pad_x=100, pad_top=50, pad_bot=40)
    da_rig = build_rig_masks(
        da_pad.shape[:2], da_px, da_py,
        cfg["dash_hip"], cfg["dash_hip"] + 95.0, float(dash_im.height - 5), cfg["dash_split"], 0.0
    )
    da_ax = dash_info["anchorX"] + da_px
    da_ay = dash_info["anchorY"] + da_py

    ae_pad, ae_px, ae_py = pad_sprite(aerial_im, pad_x=96, pad_top=50, pad_bot=40)
    ae_rig = build_rig_masks(
        ae_pad.shape[:2], ae_px, ae_py,
        295.0, 405.0, float(aerial_im.height - 5), 240.0, 0.0
    )
    ae_ax = aerial_info["anchorX"] + ae_px
    ae_ay = aerial_info["anchorY"] + ae_py

    bk_pad, bk_px, bk_py = pad_sprite(back_im, pad_x=96, pad_top=50, pad_bot=40)
    bk_rig = build_rig_masks(
        bk_pad.shape[:2], bk_px, bk_py,
        310.0, 415.0, float(back_im.height - 5), float(back_info["anchorX"]), 0.0
    )
    bk_ax = back_info["anchorX"] + bk_px
    bk_ay = back_info["anchorY"] + bk_py

    generated: dict[str, tuple[Image.Image, int, int]] = {}

    def save_pose(name: str, im: Image.Image, ax: int, ay: int) -> None:
        generated[name] = (im, ax, ay)
        f1 = f"{name}.png"
        f2 = f"{name}_p2.png"
        im.save(os.path.join(sprite_dir, f1))
        apply_p2_palette(im, char_id).save(os.path.join(sprite_dir, f2))
        meta[name] = {
            "file": f1,
            "fileP2": f2,
            "width": im.width,
            "height": im.height,
            "anchorX": ax,
            "anchorY": ay,
        }

    X, Y = st_rig["X"], st_rig["Y"]
    pivot_y = float(st_rig["cy_hip"])

    # 1. 4-frame Grounded Breathing Idle (feet strictly pinned at dy=0)
    for i in range(4):
        phi = 2.0 * math.pi * i / 4.0
        breath_y = -4.0 * math.sin(phi)
        sway_x = 3.0 * math.cos(phi)
        dx = sway_x * st_rig["w_upper"] + 6.0 * math.sin(phi + 0.8) * st_rig["w_hair_trail"]
        dy = breath_y * st_rig["w_upper"] + 3.0 * math.cos(phi + 0.6) * st_rig["w_hair_trail"]
        warped = warp_rgba(st_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
        save_pose(f"idle_{i}", im, ax, ay)

    # 2. 8-frame Forward Walk Cycle (foot-to-ground alternating stride + grounded hip dip!)
    for i in range(8):
        phi = 2.0 * math.pi * i / 8.0
        stride = 36.0
        lift = 26.0
        # Alternating horizontal swing vs planted stance leg
        lx = stride * math.sin(phi)
        rx = -stride * math.sin(phi)
        # Swing foot lifts during its positive-cos phase; stance foot stays flat at dy=0!
        ly = -lift * max(0.0, math.cos(phi)) ** 1.25
        ry = -lift * max(0.0, -math.cos(phi)) ** 1.25
        # Weight settles DOWN into each contact/plant step (no upward hovering!)
        hip_dip = 9.0 * abs(math.sin(phi))
        lean_dx, lean_dy = apply_upper_lean(X, Y, st_ax, pivot_y, 0.085, st_rig["w_upper"])
        dx = (
            lx * st_rig["w_left_stride"]
            + rx * st_rig["w_right_stride"]
            + lean_dx
            + 7.0 * math.sin(phi * 2.0) * st_rig["w_hair_trail"]
        )
        dy = (
            ly * st_rig["w_left_stride"]
            + ry * st_rig["w_right_stride"]
            + hip_dip * st_rig["w_upper"]
            + lean_dy
        )
        warped = warp_rgba(st_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
        save_pose(f"walk_fwd_{i}", im, ax, ay)

    # 3. 8-frame Backward Guard Walk Cycle (cautious defensive retreat steps)
    for i in range(8):
        phi = 2.0 * math.pi * i / 8.0
        stride = 26.0
        lift = 18.0
        lx = -stride * math.sin(phi)
        rx = stride * math.sin(phi)
        ly = -lift * max(0.0, math.cos(phi)) ** 1.25
        ry = -lift * max(0.0, -math.cos(phi)) ** 1.25
        hip_dip = 6.5 * abs(math.sin(phi))
        lean_dx, lean_dy = apply_upper_lean(X, Y, st_ax, pivot_y, -0.055, st_rig["w_upper"])
        dx = (
            lx * st_rig["w_left_stride"]
            + rx * st_rig["w_right_stride"]
            + lean_dx
            + 5.0 * math.sin(phi * 2.0) * st_rig["w_hair_trail"]
        )
        dy = (
            ly * st_rig["w_left_stride"]
            + ry * st_rig["w_right_stride"]
            + hip_dip * st_rig["w_upper"]
            + lean_dy
        )
        warped = warp_rgba(st_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
        save_pose(f"walk_back_{i}", im, ax, ay)

    # 4. 4-frame Sprint / Dash Run Cycle (from dash sprite)
    DX, DY = da_rig["X"], da_rig["Y"]
    for i in range(4):
        phi = 2.0 * math.pi * i / 4.0
        pump = 24.0
        lift = 14.0
        lx = pump * math.sin(phi)
        rx = -pump * math.sin(phi)
        ly = -lift * math.cos(phi)
        ry = lift * math.cos(phi)
        bounce = 5.0 * abs(math.sin(phi))
        hair_wave = 10.0 * math.sin(phi + 1.0)
        dx = lx * da_rig["w_left_stride"] + rx * da_rig["w_right_stride"] + hair_wave * da_rig["w_hair_trail"]
        dy = ly * da_rig["w_left_stride"] + ry * da_rig["w_right_stride"] + bounce * da_rig["w_upper"] + hair_wave * 0.5 * da_rig["w_hair_trail"]
        warped = warp_rgba(da_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, da_ax, da_ay, grounded=True)
        save_pose(f"run_{i}", im, ax, ay)

    # 5. True Knee-Bend Crouch (2 breathing frames — ZERO head squishing & laser-straight weapon!)
    for idx, drop_px in enumerate([56.0, 61.0]):
        hip_out_y = pivot_y + drop_px
        w_up_out = 1.0 - smoothstep(hip_out_y - 24.0, hip_out_y + 18.0, Y)
        if min_leg_x := cfg["min_leg_x"]:
            diag_x = st_px + min_leg_x - 0.82 * np.maximum(0.0, Y - hip_out_y)
            w_leg_guard = smoothstep(diag_x - 5.0, diag_x + 5.0, X)
            w_body_out = np.maximum(w_up_out, 1.0 - w_leg_guard)
        else:
            w_leg_guard = np.ones_like(X)
            w_body_out = w_up_out

        lean_dx, lean_dy = apply_upper_lean(X, Y, st_ax, hip_out_y, 0.065, w_body_out)
        dy_leg_grad = drop_px * (1.0 - smoothstep(hip_out_y - 6.0, float(st_rig["cy_foot"]) - 14.0, Y))
        knee_y_out = float(st_rig["cy_knee"]) + drop_px * 0.45
        w_knee_out = np.exp(-((Y - knee_y_out) / 48.0) ** 2) * smoothstep(hip_out_y - 8.0, hip_out_y + 22.0, Y) * w_leg_guard
        w_l_knee = (1.0 - smoothstep(st_px + cfg["x_split"] - 20.0, st_px + cfg["x_split"] + 20.0, X)) * w_knee_out
        w_r_knee = smoothstep(st_px + cfg["x_split"] - 20.0, st_px + cfg["x_split"] + 20.0, X) * w_knee_out

        knee_bow = 25.0 * (drop_px / 58.0)
        dx = (-knee_bow * w_l_knee + knee_bow * w_r_knee) + lean_dx
        dy = drop_px * w_body_out + dy_leg_grad * (1.0 - w_body_out) + lean_dy
        warped = warp_rgba(st_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
        save_pose(f"crouch_{idx}", im, ax, ay)

    # 6. Pre-Jump Anticipation Coil (jumpsquat) & Heavy Landing Shock Absorption (land_heavy)
    for pose_name, drop_px, lean_rad, bow in [
        ("jumpsquat", 42.0, 0.08, 22.0),
        ("land_heavy", 52.0, 0.11, 26.0),
    ]:
        hip_out_y = pivot_y + drop_px
        w_up_out = 1.0 - smoothstep(hip_out_y - 24.0, hip_out_y + 18.0, Y)
        if min_leg_x := cfg["min_leg_x"]:
            diag_x = st_px + min_leg_x - 0.82 * np.maximum(0.0, Y - hip_out_y)
            w_leg_guard = smoothstep(diag_x - 5.0, diag_x + 5.0, X)
            w_body_out = np.maximum(w_up_out, 1.0 - w_leg_guard)
        else:
            w_leg_guard = np.ones_like(X)
            w_body_out = w_up_out

        lean_dx, lean_dy = apply_upper_lean(X, Y, st_ax, hip_out_y, lean_rad, w_body_out)
        dy_leg_grad = drop_px * (1.0 - smoothstep(hip_out_y - 6.0, float(st_rig["cy_foot"]) - 14.0, Y))
        knee_y_out = float(st_rig["cy_knee"]) + drop_px * 0.45
        w_knee_out = np.exp(-((Y - knee_y_out) / 48.0) ** 2) * smoothstep(hip_out_y - 8.0, hip_out_y + 22.0, Y) * w_leg_guard
        w_l_knee = (1.0 - smoothstep(st_px + cfg["x_split"] - 20.0, st_px + cfg["x_split"] + 20.0, X)) * w_knee_out
        w_r_knee = smoothstep(st_px + cfg["x_split"] - 20.0, st_px + cfg["x_split"] + 20.0, X) * w_knee_out

        dx = (-bow * w_l_knee + bow * w_r_knee) + lean_dx
        dy = drop_px * w_body_out + dy_leg_grad * (1.0 - w_body_out) + lean_dy
        warped = warp_rgba(st_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
        save_pose(pose_name, im, ax, ay)

    # 7. Airborne Rise & Heavy Fall (from aerial sprite)
    AX, AY = ae_rig["X"], ae_rig["Y"]
    for pose_name, tilt_rad, hair_dy in [
        ("jump_rise", -0.10, 14.0),
        ("jump_fall", 0.14, -18.0),
    ]:
        rot_dx, rot_dy = apply_upper_lean(AX, AY, ae_ax, float(ae_rig["cy_hip"]), tilt_rad, np.ones_like(AX))
        dx = rot_dx - 10.0 * ae_rig["w_hair_trail"]
        dy = rot_dy + hair_dy * ae_rig["w_hair_trail"]
        warped = warp_rgba(ae_pad, dx, dy)
        im, ax, ay = crop_and_anchor(warped, ae_ax, ae_ay, grounded=False)
        save_pose(pose_name, im, ax, ay)

    # 8. Dash Skid Brake (boots dug into stone floor, upper body leaning back resisting forward inertia!)
    lean_dx, lean_dy = apply_upper_lean(X, Y, st_ax, pivot_y + 18.0, -0.17, st_rig["w_rigid_body"])
    dy_leg_grad = 18.0 * (1.0 - smoothstep(pivot_y - 10.0, float(st_rig["cy_foot"]) - 14.0, Y))
    dx = 22.0 * st_rig["w_right_stride"] - 10.0 * st_rig["w_left_stride"] + lean_dx
    dy = 18.0 * st_rig["w_rigid_body"] + dy_leg_grad * (1.0 - st_rig["w_rigid_body"]) + lean_dy
    warped = warp_rgba(st_pad, dx, dy)
    im, ax, ay = crop_and_anchor(warped, st_ax, st_ay, grounded=True)
    save_pose("dash_brake", im, ax, ay)

    # 9. Defensive Evasive Backdash Hop (from guard / heroic)
    BX, BY = bk_rig["X"], bk_rig["Y"]
    rot_dx, rot_dy = apply_upper_lean(BX, BY, bk_ax, float(bk_rig["cy_hip"]), -0.13, np.ones_like(BX))
    dy_tuck = -18.0 * smoothstep(float(bk_rig["cy_hip"]), float(bk_rig["cy_foot"]), BY)
    warped = warp_rgba(bk_pad, rot_dx, rot_dy + dy_tuck)
    im, ax, ay = crop_and_anchor(warped, bk_ax, bk_ay, grounded=False)
    save_pose("backdash", im, ax, ay)

    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(meta, fp, indent=2)

    # Generate diagnostic contact sheet on crisp floor baseline
    sample_names = [
        "idle_0", "walk_fwd_0", "walk_fwd_2", "walk_fwd_4", "walk_fwd_6",
        "run_0", "crouch_0", "jumpsquat", "jump_rise", "jump_fall",
        "land_heavy", "dash_brake", "backdash",
    ]
    cell_w, cell_h = 560, 640
    strip = Image.new("RGBA", (cell_w * len(sample_names), cell_h), (16, 18, 34, 255))
    draw = ImageDraw.Draw(strip)
    floor_y = 590
    draw.line([(0, floor_y), (strip.width, floor_y)], fill=(255, 42, 160, 255), width=4)
    for idx, name in enumerate(sample_names):
        im, ax, ay = generated[name]
        cx = idx * cell_w + cell_w // 2
        draw.line([(cx, 30), (cx, floor_y)], fill=(70, 90, 140, 180), width=2)
        strip.paste(im, (cx - ax, floor_y - ay), im)
        draw.text((idx * cell_w + 18, 16), name, fill=(255, 220, 100, 255))

    debug_path = os.path.join(RAW_DIR, f"debug_locomotion_{char_id}.png")
    strip.convert("RGB").save(debug_path)
    print(f"  -> Wrote {len(generated)} locomotion frames + {debug_path}")


if __name__ == "__main__":
    generate_character_locomotion("rin")
    generate_character_locomotion("lia")
    print("[Locomotion] Done!")
