import os
import shutil
import win32com.client
import wave

def generate_sample_meeting_wav():
    voice = win32com.client.Dispatch("Sapi.SpVoice")
    stream = win32com.client.Dispatch("Sapi.SpFileStream")

    for v in voice.GetVoices():
        if "Haruka" in v.GetDescription():
            voice.Voice = v
            print(f"Using voice: {v.GetDescription()}")
            break

    voice.Rate = 1 # 自然で聞き取りやすいビジネス速度
    voice.Volume = 100

    targets = [
        os.path.abspath("public/sample_confidential_meeting.wav"),
        os.path.abspath("dist/sample_confidential_meeting.wav"),
        os.path.abspath("evaluation/audio/01_sample_confidential_meeting.wav")
    ]

    for p in targets:
        os.makedirs(os.path.dirname(p), exist_ok=True)

    main_target = targets[0]

    # SSFMCreateForWrite = 3
    stream.Open(main_target, 3)
    voice.AudioOutputStream = stream

    # 3つの社外秘発話文
    text_parts = [
        "本日の社外秘経営会議を始めます。新製品の想定単価は月額4万9800円、目標は300社です。",
        "法務窓口の直通番号は090-1234-5678、連絡先は legal@example.com です。",
        "マイナンバー1234-5678-9012などの重要機密は、外部送信せずローカルで安全に処理してください。"
    ]
    script_text = "　".join(text_parts)

    voice.Speak(script_text)
    stream.Close()

    with wave.open(main_target, "rb") as w:
        frames = w.getnframes()
        rate = w.getframerate()
        duration = frames / float(rate)
        size = os.path.getsize(main_target)
        print(f"Generated {main_target}: duration={duration:.2f}s, size={size} bytes")

    for p in targets[1:]:
        shutil.copy2(main_target, p)
        print(f"Copied to {p}")

if __name__ == "__main__":
    generate_sample_meeting_wav()
