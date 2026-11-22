// Запуск решений задач в отдельном потоке: Python (Pyodide) грузится сюда один раз,
// каждый запуск выполняется в чистом пространстве имён. Страница (problems.js) общается так:
//   → { code, stdin }                         запустить код
//   ← { type: "ready" }                       Python загрузился
//   ← { type: "out" | "err", text }           кусок вывода: stdout или stderr (ошибки)
//   ← { type: "done" }                        программа закончилась
//   ← { type: "fail", text }                  не удалось загрузить Python
// Остановить бесконечный цикл можно только убив поток целиком — это делает страница.
import { loadPyodide } from "../pyodide/314.0.7/pyodide.mjs";

const LIMIT = 200000;   // больше стольких символов вывода не пересылаем: защита от print в бесконечном цикле
let sent = 0, stdinLines = [];

function emit(type, text) {
  if (sent >= LIMIT) return;
  if (sent + text.length > LIMIT) text = text.slice(0, LIMIT - sent) + "\n… вывод обрезан\n";
  sent += text.length;
  postMessage({ type, text });
}
function writer(type) {
  const dec = new TextDecoder();
  return { write(buf) { emit(type, dec.decode(buf, { stream: true })); return buf.length; } };
}

const ready = loadPyodide({ indexURL: new URL("../pyodide/314.0.7/", import.meta.url).href }).then((py) => {
  py.setStdout(writer("out"));
  py.setStderr(writer("err"));
  py.setStdin({ stdin: () => (stdinLines.length ? stdinLines.shift() : null) });
  // traceback без внутренних кадров Pyodide: файл решения называется solution.py
  py.runPython(`
import linecache, sys, traceback
def _run_solution(code):
    # строки решения в linecache, чтобы traceback показывал код упавшей строки
    linecache.cache["solution.py"] = (len(code), None, code.splitlines(True), "solution.py")
    try:
        exec(compile(code, "solution.py", "exec"), {"__name__": "__main__"})
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code, file=sys.stderr)
    except BaseException as e:
        traceback.print_exception(type(e), e, e.__traceback__.tb_next)
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
`);
  postMessage({ type: "ready" });
  return py;
}, (err) => {
  postMessage({ type: "fail", text: String(err && err.message || err) });
  throw err;
});

self.onmessage = async (e) => {
  const py = await ready;
  sent = 0;
  stdinLines = String(e.data.stdin || "").split("\n");
  if (stdinLines[stdinLines.length - 1] === "") stdinLines.pop();
  const run = py.globals.get("_run_solution");
  try { run(e.data.code); } finally { run.destroy(); }
  postMessage({ type: "done" });
};
