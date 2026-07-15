import math

import random

import time


from ._common import FAST_MODE, _log


def _random_sleep(page, min_ms: int = 200, max_ms: int = 600) -> None:

    if FAST_MODE:

        page.wait_for_timeout(max(50, min_ms // 4))

    else:

        page.wait_for_timeout(random.randint(min_ms, max_ms))


def _human_type(page, selector: str, text: str) -> None:

    el = page.locator(selector)

    if el.count() == 0:

        return

    if FAST_MODE:

        try:

            el.first.click(timeout=3000)

            page.wait_for_timeout(30)

            el.first.fill(text)

            page.wait_for_timeout(30)

        except Exception:

            el.first.fill(text)

        return

    _human_click(page, selector)

    _random_sleep(page, 100, 300)

    el.first.fill("")

    _random_sleep(page, 80, 200)

    for char in text:

        el.first.type(char, delay=random.randint(50, 180))

    _random_sleep(page, 100, 400)


def _human_click(page, selector: str) -> None:

    el = page.locator(selector)

    if el.count() == 0:

        return

    if FAST_MODE:

        el.first.click(timeout=3000)

        return

    try:

        box = el.first.bounding_box()

        if box:

            x = box["x"] + box["width"] * random.uniform(0.3, 0.7)

            y = box["y"] + box["height"] * random.uniform(0.3, 0.7)

            _smooth_mouse_move(page, x, y)

            _random_sleep(page, 50, 150)

            page.mouse.click(x, y)

        else:

            el.first.click()

    except Exception:

        el.first.click()


def _smooth_mouse_move(page, target_x: float, target_y: float, steps: int = 0) -> None:

    if steps == 0:

        steps = random.randint(8, 20)

    start_x = random.uniform(100, 400)

    start_y = random.uniform(50, 200)

    cp1_x = start_x + (target_x - start_x) * random.uniform(0.2, 0.5) + random.uniform(-30, 30)

    cp1_y = start_y + (target_y - start_y) * random.uniform(0.1, 0.4) + random.uniform(-20, 20)

    cp2_x = start_x + (target_x - start_x) * random.uniform(0.5, 0.8) + random.uniform(-20, 20)

    cp2_y = start_y + (target_y - start_y) * random.uniform(0.6, 0.9) + random.uniform(-10, 10)

    for i in range(steps + 1):

        t = i / steps

        inv_t = 1 - t

        x = (
            inv_t**3 * start_x
            + 3 * inv_t**2 * t * cp1_x
            + 3 * inv_t * t**2 * cp2_x
            + t**3 * target_x
        )

        y = (
            inv_t**3 * start_y
            + 3 * inv_t**2 * t * cp1_y
            + 3 * inv_t * t**2 * cp2_y
            + t**3 * target_y
        )

        page.mouse.move(x, y)

        speed = 2 + 6 * math.sin(math.pi * t)

        time.sleep(random.uniform(0.005, 0.02) / max(speed, 0.1))


def _robust_input(page, selector: str, value: str, max_retries: int = 3) -> bool:

    el = page.locator(selector)

    if el.count() == 0:

        return False

    actual = ""

    for attempt in range(max_retries):

        _human_type(page, selector, value)

        _random_sleep(page, 200, 400)

        try:

            actual = el.first.input_value()

            if actual == value:

                return True

        except Exception:

            pass

        if attempt < max_retries - 1:

            _log(
                f"[RPA] 输入验证失败 ({selector}: '{actual}' != '{value}')  重试 {attempt + 2}/{max_retries}"
            )

    return False
