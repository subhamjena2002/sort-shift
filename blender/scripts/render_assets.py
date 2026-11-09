"""Entry point: renders Blender assets into blender/source/.

    blender --background --python blender/scripts/render_assets.py -- all
    blender --background --python blender/scripts/render_assets.py -- parcels bins

Then run build_web_assets.py to compose shadows and write the WebP files.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
sys.dont_write_bytecode = True

import generate_parcels  # noqa: E402


def _generators():
    generators = {"parcels": generate_parcels.generate}
    for name, module_name in (("conveyor", "generate_conveyor"), ("bins", "generate_sorting_bins"), ("backgrounds", "generate_factory_background")):
        try:
            module = __import__(module_name)
        except ModuleNotFoundError:
            continue
        generators[name] = module.generate
    return generators


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else ["all"]
    generators = _generators()
    selected = list(generators) if "all" in argv else argv
    for name in selected:
        if name not in generators:
            raise SystemExit(f"Unknown asset group: {name}. Known: {', '.join(generators)}")
        started = time.time()
        generators[name]()
        print(f"GROUP {name} finished in {time.time() - started:.1f}s")


try:
    main()
except Exception:
    import traceback

    traceback.print_exc()
    sys.exit(1)
