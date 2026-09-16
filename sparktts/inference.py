from __future__ import annotations

import re
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from sparktts.models.audio_tokenizer import BiCodecTokenizer
from sparktts.utils.file import load_config
from sparktts.utils.token_parser import GENDER_MAP, LEVELS_MAP, TASK_TOKEN_MAP


class SparkTTS:
    """Spark-TTS inference wrapper used by the memoir TTS worker."""

    def __init__(self, model_dir: str | Path, device: str | torch.device = "cpu") -> None:
        self.model_dir = Path(model_dir)
        self.device = torch.device(device) if not isinstance(device, torch.device) else device
        self.configs = load_config(self.model_dir / "config.yaml")
        self.sample_rate = int(self.configs["sample_rate"])
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir / "LLM"))
        self.model = AutoModelForCausalLM.from_pretrained(str(self.model_dir / "LLM"))
        self.audio_tokenizer = BiCodecTokenizer(self.model_dir, device=self.device)
        self.model.to(self.device)
        self.model.eval()
        self._ref_cache_key: tuple | None = None
        self._ref_cache: tuple | None = None

    def _cached_ref_tokens(self, prompt_speech_path: Path, prompt_text: str | None):
        path = Path(prompt_speech_path)
        key = (str(path.resolve()), path.stat().st_mtime_ns if path.exists() else 0, prompt_text or "")
        if self._ref_cache_key == key and self._ref_cache is not None:
            return self._ref_cache
        global_token_ids, semantic_token_ids = self.audio_tokenizer.tokenize(str(path))
        cached = (global_token_ids.detach().clone(), semantic_token_ids.detach().clone())
        self._ref_cache_key = key
        self._ref_cache = cached
        return cached

    def process_prompt(self, text: str, prompt_speech_path: Path, prompt_text: str | None = None):
        global_token_ids, semantic_token_ids = self._cached_ref_tokens(prompt_speech_path, prompt_text)
        global_tokens = "".join(f"<|bicodec_global_{i}|>" for i in global_token_ids.squeeze())
        if prompt_text:
            semantic_tokens = "".join(f"<|bicodec_semantic_{i}|>" for i in semantic_token_ids.squeeze())
            parts = [
                TASK_TOKEN_MAP["tts"],
                "<|start_content|>",
                prompt_text,
                text,
                "<|end_content|>",
                "<|start_global_token|>",
                global_tokens,
                "<|end_global_token|>",
                "<|start_semantic_token|>",
                semantic_tokens,
            ]
        else:
            parts = [
                TASK_TOKEN_MAP["tts"],
                "<|start_content|>",
                text,
                "<|end_content|>",
                "<|start_global_token|>",
                global_tokens,
                "<|end_global_token|>",
            ]
        return "".join(parts), global_token_ids

    def process_prompt_control(self, gender: str, pitch: str, speed: str, text: str) -> str:
        gender_id = GENDER_MAP[gender]
        pitch_level_id = LEVELS_MAP[pitch]
        speed_level_id = LEVELS_MAP[speed]
        attribute_tokens = "".join(
            [
                f"<|gender_{gender_id}|>",
                f"<|pitch_label_{pitch_level_id}|>",
                f"<|speed_label_{speed_level_id}|>",
            ]
        )
        return "".join(
            [
                TASK_TOKEN_MAP["controllable_tts"],
                "<|start_content|>",
                text,
                "<|end_content|>",
                "<|start_style_label|>",
                attribute_tokens,
                "<|end_style_label|>",
            ]
        )

    @torch.no_grad()
    def inference(
        self,
        text: str,
        prompt_speech_path: str | Path | None = None,
        prompt_text: str | None = None,
        gender: str | None = None,
        pitch: str | None = None,
        speed: str | None = None,
        temperature: float = 0.8,
        top_k: float = 50,
        top_p: float = 0.95,
        max_new_tokens: int = 3000,
    ):
        if gender:
            prompt = self.process_prompt_control(
                gender,
                pitch or "moderate",
                speed or "moderate",
                text,
            )
            global_token_ids = None
        else:
            if not prompt_speech_path:
                raise ValueError("克隆声音需要参考音频，或使用带 gender 的默认声音")
            prompt, global_token_ids = self.process_prompt(
                text,
                Path(prompt_speech_path),
                prompt_text,
            )

        model_inputs = self.tokenizer([prompt], return_tensors="pt").to(self.device)
        generated_ids = self.model.generate(
            **model_inputs,
            max_new_tokens=max(64, int(max_new_tokens or 3000)),
            do_sample=True,
            top_k=top_k,
            top_p=top_p,
            temperature=temperature,
        )
        generated_ids = [
            output_ids[len(input_ids) :]
            for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]
        predicts = self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        pred_semantic_ids = (
            torch.tensor([int(token) for token in re.findall(r"bicodec_semantic_(\d+)", predicts)])
            .long()
            .unsqueeze(0)
        )
        if gender is not None:
            global_token_ids = (
                torch.tensor([int(token) for token in re.findall(r"bicodec_global_(\d+)", predicts)])
                .long()
                .unsqueeze(0)
                .unsqueeze(0)
            )
        wav = self.audio_tokenizer.detokenize(
            global_token_ids.to(self.device).squeeze(0),
            pred_semantic_ids.to(self.device),
        )
        return wav
