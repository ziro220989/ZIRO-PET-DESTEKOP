# -*- coding: utf-8 -*-
import sys
import speech_recognition as sr

def main():
    if len(sys.argv) < 2:
        print("")
        return

    audio_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "es-ES"

    r = sr.Recognizer()
    r.dynamic_energy_threshold = True
    r.energy_threshold = 40
    r.pause_threshold = 0.6

    try:
        with sr.AudioFile(audio_path) as source:
            try:
                r.adjust_for_ambient_noise(source, duration=0.15)
            except Exception:
                pass
            audio = r.record(source)

        candidates = [lang]
        for extra in ["es-ES", "es-AR", "es-MX", "es"]:
            if extra not in candidates:
                candidates.append(extra)

        recognized_text = ""
        for l in candidates:
            try:
                text = r.recognize_google(audio, language=l)
                if text and text.strip():
                    recognized_text = text.strip()
                    break
            except sr.UnknownValueError:
                continue
            except sr.RequestError as e:
                sys.stderr.write(f"STT_REQ_ERR: {e}\n")
                break
            except Exception as e:
                continue

        print(recognized_text)
    except Exception as e:
        sys.stderr.write(f"STT_FATAL_ERR: {e}\n")
        print("")

if __name__ == "__main__":
    main()
