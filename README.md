# claude-plugins

wookiist가 만든 Claude Code 플러그인을 모아 둔 마켓플레이스예요.

## 플러그인 목록

### status-bar

입력창 위에 상태 줄을 한 줄 보여줘요. CLI에서는 상태 줄 위에 구분선도 그려요.

```
[Opus 5.5 (high)] ctx 42% / 5h 12% / 7d 30% / turn 7 / 1.2M/40k / cache 96%
```

| 항목 | 내용 |
| --- | --- |
| `Opus 5.5 (high)` | 현재 모델과 effort예요. `/model`, `/effort`로 바꾸면 바로 반영돼요. |
| `ctx` | 컨텍스트 창 사용률이에요. |
| `5h`, `7d` | 5시간, 7일 사용량 한도 대비 사용률이에요. 구독 계정에서만 보여요. |
| `turn` | 이 세션에서 끝난 턴 수예요. 서브에이전트 턴은 세지 않아요. |
| `1.2M/40k` | 캐시 읽기 토큰과 캐시 쓰기 토큰의 누적값이에요. |
| `cache` | 입력 토큰 가운데 캐시에서 읽은 비율이에요. |

사용률은 50% 미만이면 초록, 80% 미만이면 노랑, 80% 이상이면 빨강으로 표시해요. 캐시 적중률은 반대로 높을수록 초록이에요.

### pomodoro

입력창 위에 뽀모도로 타이머를 한 줄 보여줘요. 소리는 내지 않고, 집중이나 휴식이 끝나면 알림 토스트만 띄워요.

```
집중 24:13
```

| 명령 | 동작 |
| --- | --- |
| `/pomodoro`, `/pomodoro start` | 집중 시간을 시작해요. 끝나면 휴식이 자동으로 시작돼요. |
| `/pomodoro break` | 바로 휴식을 시작해요. |
| `/pomodoro stop` | 타이머를 멈춰요. |

기본값은 집중 25분, 휴식 5분이에요. `/config`의 `workMinutes`, `breakMinutes`에서 바꿀 수 있어요. 타이머는 플러그인 저장소에 남아서 세션을 다시 열어도 이어지고, 여러 세션에서 같은 타이머를 보여줘요. status-bar와 함께 설치해도 상태 줄과 타이머 줄이 함께 보여요.

## 설치

터미널에서 Claude Code를 열고 프롬프트에 입력해요.

```
/plugin install status-bar --marketplace wookiist/claude-plugins
/plugin install pomodoro --marketplace wookiist/claude-plugins
```

마켓플레이스를 추가할지 물으면 `y`를 누르고, 범위는 user를 고르면 돼요. 이 명령은 데스크톱 앱의 Code 탭에서는 실행되지 않아요. 터미널에서 user 범위로 설치하면 데스크톱 앱에서도 로드돼요.
