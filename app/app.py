from flask import Flask, render_template, jsonify, request, send_file
import edge_tts
from dotenv import load_dotenv
from gevent.pywsgi import WSGIServer
import os
import asyncio
import tempfile
from io import BytesIO
import re
import emoji

app = Flask(__name__)
load_dotenv()


def prepare_tts_input_with_context(text: str) -> str:
    """
    Prepares text for a TTS API by cleaning Markdown and adding minimal contextual hints
    for certain Markdown elements like headers. Preserves paragraph separation.

    Args:
        text (str): The raw text containing Markdown or other formatting.

    Returns:
        str: Cleaned text with contextual hints suitable for TTS input.
    """

    # Remove emojis
    text = emoji.replace_emoji(text, replace='')

    # Add context for headers
    def header_replacer(match):
        level = len(match.group(1))  # Number of '#' symbols
        header_text = match.group(2).strip()
        if level == 1:
            return f"Title — {header_text}\n"
        elif level == 2:
            return f"Section — {header_text}\n"
        else:
            return f"Subsection — {header_text}\n"

    text = re.sub(r"^(#{1,6})\s+(.*)", header_replacer, text, flags=re.MULTILINE)

    # Announce links (currently commented out for potential future use)
    # text = re.sub(r"\[([^\]]+)\]\((https?:\/\/[^\)]+)\)", r"\1 (link: \2)", text)

    # Remove links while keeping the link text
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)

    # Describe inline code
    text = re.sub(r"`([^`]+)`", r"code snippet: \1", text)

    # Remove bold/italic symbols but keep the content
    text = re.sub(r"(\*\*|__|\*|_)", '', text)

    # Remove code blocks (multi-line) with a description
    text = re.sub(r"```([\s\S]+?)```", r"(code block omitted)", text)

    # Remove image syntax but add alt text if available
    text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"Image: \1", text)

    # Remove HTML tags
    text = re.sub(r"</?[^>]+(>|$)", '', text)

    # Normalize line breaks
    text = re.sub(r"\n{2,}", '\n\n', text)  # Ensure consistent paragraph separation

    # Replace multiple spaces within lines
    text = re.sub(r" {2,}", ' ', text)

    # Trim leading and trailing whitespace from the whole text
    text = text.strip()

    return text

# TTS速度转换函数
def speed_to_rate(speed: float) -> str:
    if speed < 0 or speed > 2:
        raise ValueError("Speed must be between 0 and 2 (inclusive).")

    percentage_change = (speed - 1) * 100

    return f"{percentage_change:+.0f}%"

# 配置数据
@app.route('/api/config')
def get_config():
    return jsonify({
        'ttsVoice': os.getenv('TTS_VOICE'),
        'ttsSpeed': float(os.getenv('TTS_SPEED')),
        'baseUrl': os.getenv('AI_BASE_URL'),
        'apiKey': os.getenv('AI_API_KEY'),
        'model': os.getenv('AI_MODEL'),
        'evalPrompt': os.getenv('EVAL_PROMPT'),
        'translatePrompt': os.getenv('TRANSLATE_PROMPT'),
    })


# TTS 接口
@app.route('/api/tts/speak', methods=['POST'])
def text_to_speech():
    try:
        data = request.json
        rawtext = data.get('text')
        if not rawtext:
            return jsonify({'error': 'Missing text parameter'}), 400
        text = prepare_tts_input_with_context(rawtext)

        voice = data.get('voice', os.getenv('TTS_VOICE'))
        speed = data.get('rate', float(os.getenv('TTS_SPEED')))
        rate = speed_to_rate(float(speed))

        async def generate_speech():
            try:
                communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
                temp_file_path = None

                # 使用临时文件来存储音频
                with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                    temp_file_path = tmp_file.name
                    await communicate.save(temp_file_path)

                # 读取文件内容到内存
                with open(temp_file_path, 'rb') as audio_file:
                    audio_data = audio_file.read()

                return audio_data

            except Exception as e:
                print(f"Error generating speech: {str(e)}")
                raise

            finally:
                # 在 finally 块中安全删除临时文件
                if temp_file_path and os.path.exists(temp_file_path):
                    try:
                        os.close(os.open(temp_file_path, os.O_RDONLY))  # 确保文件句柄已关闭
                        os.unlink(temp_file_path)
                    except Exception as e:
                        print(f"Warning: Failed to delete temporary file {temp_file_path}: {str(e)}")

        audio_data = asyncio.run(generate_speech())

        return send_file(
            BytesIO(audio_data),
            mimetype='audio/mpeg',
            as_attachment=False
        )

    except Exception as e:
        print(f"TTS Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# TTS 声音列表
@app.route('/api/tts/voices')
def get_tts_voices():
    async def get_voices():
        voices = await edge_tts.list_voices()
        filtered_voices = []
        for voice in voices:
            if voice['Locale'] in ['zh-CN', 'en-US']:
                filtered_voices.append({
                    'ShortName': voice['ShortName'],
                    'Gender': voice['Gender'],
                    'Locale': voice['Locale']
                })
        return filtered_voices

    voices = asyncio.run(get_voices())
    return jsonify(voices)


# 主页
@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    http_server = WSGIServer(('0.0.0.0', 5000), app)
    print('Starting server on port 5000')
    try:
        # 启动服务器
        http_server.serve_forever()
    except KeyboardInterrupt:
        print('Shutting down server...')
        http_server.stop()
