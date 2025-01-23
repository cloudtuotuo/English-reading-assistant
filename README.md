# AI English reading Assistant

一个基于 Flask 的 AI 英文阅读助手，支持文本翻译、语音朗读和翻译评价功能。

## 背景

在上小学5年级的儿子，一直不愿好好学英文，这次考试更是考了80多分，特别是阅读题丢分最多，于是便通过AI生成了一些英文短文让他学习

我要求他在阅读的过程中，将每句的中文意思都写下来，并且将不会的单词都记录下来

过程中，发现他一边要查字典、查发音，一边又要把查过的词记下来，很不方便

于是兴趣来了，做了这款小工具

当然了，bug肯定不少，大家自己改改吧

## 功能特点

- 🔄 英文到中文的智能翻译
- 🗣️ 文本转语音（TTS）支持（Edge-tts）
- 📝 翻译质量评估
- 📚 生词本功能
- 🎯 自定义 Prompt 设置
- 🔊 支持多种语音和语速调节

## 快速开始

### 前置要求

- Docker
- Docker Compose

### 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/cloudtuotuo/English-reading-assistant.git
cd English-reading-assistant
```

2. 配置环境变量
```bash
cp .env.example .env
```
编辑 `.env` 文件，填入必要的配置信息：
```env
TTS_VOICE=zh-CN-XiaoxiaoNeural
TTS_SPEED=1.0
AI_BASE_URL=your_base_url
AI_API_KEY=your_api_key
AI_MODEL=your_model
EVAL_PROMPT=your_eval_prompt（最好基于原prompt进行修改）
TRANSLATE_PROMPT=your_translate_prompt（最好基于原prompt进行修改）
```

3. 构建和启动服务
```bash
docker-compose up -d
```

4. 访问应用
```
http://localhost:8006
```

## 使用说明

### 基础使用
1. 在左侧原文框中输入需要阅读的英文文本
2. 在右侧译文框中输入中文翻译文本

### 翻译功能
1. 原文框中选中的文本可点击翻译按钮进行翻译
2. 翻译结果会显示在tips中

### TTS 功能
- 原文框中选中的文本可点击播放按钮朗读选中的文本
- 在设置中可以调整语音和语速

### 翻译评价
- 系统会对翻译结果进行智能评价
- 提供翻译质量和改进建议

### 生词本
- 自动保存使用过翻译功能的选中文本
- 支持生词本朗读和删除操作

## 配置说明

### TTS 设置
- 支持切换不同的语音角色
- 可调节语速（0.5-2.0倍速）

### Prompt 设置
- 可自定义评价 Prompt
- 可自定义翻译 Prompt

## 技术栈

- Backend: Flask (Python)
- TTS: Edge-TTS
- Frontend: HTML, CSS, JavaScript
- Container: Docker

## 开发说明

### 本地开发环境设置

1. 创建虚拟环境
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
```

2. 安装依赖
```bash
pip install -r requirements.txt
```

3. 运行开发服务器
```bash
python app/app.py
```

### Docker 开发

构建镜像：
```bash
docker-compose build
```

启动容器：
```bash
docker-compose up -d
```

查看日志：
```bash
docker-compose logs -f
```

## 感谢

1. https://github.com/travisvn/openai-edge-tts
2. https://github.com/rany2/edge-tts
3. https://github.com/ChatGPTNextWeb/NextChat
4. Claude

## 许可证

[MIT License](LICENSE)


## 更新日志

### v1.0.0
- 初始版本发布
- 基础翻译功能
- TTS 支持
- 生词本功能

---

*注意：使用前请确保已正确配置所有必要的环境变量和API密钥。*
