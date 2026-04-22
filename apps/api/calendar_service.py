from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

PROJECT_ROOT = Path(__file__).resolve().parent
CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar']
DEFAULT_CALENDAR_TIMEZONE = 'America/Sao_Paulo'
DEFAULT_CREDENTIALS_FILENAME = 'credentials.json'
DEFAULT_TOKEN_FILENAME = 'token.json'


class GoogleCalendarError(RuntimeError):
    'Base error for Google Calendar integration.'


class CalendarDependenciesError(GoogleCalendarError):
    'Raised when Google Calendar client libraries are not installed.'


class CalendarConfigurationError(GoogleCalendarError):
    'Raised when local Google Calendar configuration files are missing.'


class CalendarAuthError(GoogleCalendarError):
    'Raised when Google Calendar authentication is required or invalid.'


class CalendarServiceError(GoogleCalendarError):
    'Raised when the Google Calendar API cannot be reached successfully.'


@dataclass(frozen=True)
class GoogleCalendarSettings:
    credentials_path: str = DEFAULT_CREDENTIALS_FILENAME
    token_path: str = DEFAULT_TOKEN_FILENAME
    calendar_id: str = 'primary'
    calendar_ids: tuple[str, ...] = ('primary',)
    timezone: str = DEFAULT_CALENDAR_TIMEZONE


@dataclass(frozen=True)
class CalendarEvent:
    event_id: str
    summary: str
    start_label: str
    start_raw: Optional[str]
    end_raw: Optional[str]
    is_all_day: bool
    location: Optional[str] = None
    html_link: Optional[str] = None
    source_calendar_id: Optional[str] = None


@dataclass(frozen=True)
class CalendarUpcomingWindow:
    time_min: str
    max_results: int


# Expected env vars: GOOGLE_CALENDAR_CREDENTIALS_PATH, GOOGLE_CALENDAR_TOKEN_PATH,
# GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_IDS, GOOGLE_CALENDAR_TIMEZONE.
def load_local_dotenv(dotenv_path: str = '.env') -> None:
    env_file = PROJECT_ROOT / dotenv_path
    if not env_file.exists():
        return

    with env_file.open(encoding='utf-8') as file_handle:
        for raw_line in file_handle:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue

            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv(PROJECT_ROOT / '.env')
else:
    load_local_dotenv()


def resolve_project_path(raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        return candidate
    return (PROJECT_ROOT / candidate).resolve()


def parse_google_calendar_ids(
    raw_value: Optional[str],
    fallback_calendar_id: str = 'primary',
) -> tuple[str, ...]:
    values = []
    if raw_value:
        values.extend(part.strip() for part in raw_value.split(','))

    fallback_value = fallback_calendar_id.strip() or 'primary'
    cleaned_ids: list[str] = []
    for calendar_id in values or [fallback_value]:
        if calendar_id and calendar_id not in cleaned_ids:
            cleaned_ids.append(calendar_id)

    if not cleaned_ids:
        cleaned_ids.append('primary')

    return tuple(cleaned_ids)



def normalize_google_calendar_settings(
    settings: GoogleCalendarSettings,
) -> GoogleCalendarSettings:
    calendar_id = settings.calendar_id.strip() or 'primary'
    return GoogleCalendarSettings(
        credentials_path=str(resolve_project_path(settings.credentials_path)),
        token_path=str(resolve_project_path(settings.token_path)),
        calendar_id=calendar_id,
        calendar_ids=parse_google_calendar_ids(
            ','.join(settings.calendar_ids),
            fallback_calendar_id=calendar_id,
        ),
        timezone=settings.timezone,
    )


class GoogleCalendarService:
    def __init__(self, settings: GoogleCalendarSettings):
        self.settings = normalize_google_calendar_settings(settings)
        self._service = None

    def authenticate(self, interactive: bool = True) -> None:
        if interactive:
            self._auth_debug(
                'Iniciando autenticacao interativa. '
                f'credentials_path={self.settings.credentials_path} '
                f'token_path={self.settings.token_path}'
            )
        self._service = self._build_service(interactive=interactive)

    def list_events_for_day(
        self,
        target_date: Optional[date] = None,
        max_results: int = 10,
    ) -> list[CalendarEvent]:
        tzinfo = self._get_timezone()
        day = target_date or datetime.now(tzinfo).date()
        start_of_day = datetime.combine(day, time.min, tzinfo)
        end_of_day = start_of_day + timedelta(days=1)
        service = self._build_service(interactive=False)

        return self._list_events_for_window(
            service=service,
            calendar_ids=self.settings.calendar_ids,
            tzinfo=tzinfo,
            time_min=start_of_day.isoformat(),
            time_max=end_of_day.isoformat(),
            max_results=max_results,
            error_message='Google Calendar read failed for all configured calendars.',
        )

    def list_upcoming_events(
        self,
        max_results: int = 5,
        from_datetime: Optional[datetime] = None,
    ) -> list[CalendarEvent]:
        tzinfo = self._get_timezone()
        start = from_datetime.astimezone(tzinfo) if from_datetime else datetime.now(tzinfo)
        window = CalendarUpcomingWindow(time_min=start.isoformat(), max_results=max_results)
        service = self._build_service(interactive=False)

        return self._list_events_for_window(
            service=service,
            calendar_ids=self.settings.calendar_ids,
            tzinfo=tzinfo,
            time_min=window.time_min,
            time_max=None,
            max_results=window.max_results,
            error_message='Google Calendar upcoming read failed for all configured calendars.',
        )

    def create_event(
        self,
        summary: str,
        start_at: datetime | date,
        end_at: datetime | date,
        description: Optional[str] = None,
        location: Optional[str] = None,
    ) -> CalendarEvent:
        service = self._build_service(interactive=False)
        payload = self._build_event_payload(
            summary=summary,
            start_at=start_at,
            end_at=end_at,
            description=description,
            location=location,
        )

        try:
            created = (
                service.events()
                .insert(calendarId=self.settings.calendar_id, body=payload)
                .execute()
            )
        except Exception as exc:
            raise CalendarServiceError('Google Calendar event creation failed.') from exc

        return self._normalize_event(created, self._get_timezone())

    def update_event(self, event_id: str, **updates: Any) -> CalendarEvent:
        service = self._build_service(interactive=False)

        try:
            current_event = (
                service.events()
                .get(calendarId=self.settings.calendar_id, eventId=event_id)
                .execute()
            )
        except Exception as exc:
            raise CalendarServiceError('Google Calendar event lookup failed.') from exc

        current_event.update({key: value for key, value in updates.items() if value is not None})

        try:
            updated = (
                service.events()
                .update(
                    calendarId=self.settings.calendar_id,
                    eventId=event_id,
                    body=current_event,
                )
                .execute()
            )
        except Exception as exc:
            raise CalendarServiceError('Google Calendar event update failed.') from exc

        return self._normalize_event(updated, self._get_timezone())

    def delete_event(self, event_id: str) -> None:
        service = self._build_service(interactive=False)

        try:
            service.events().delete(
                calendarId=self.settings.calendar_id,
                eventId=event_id,
            ).execute()
        except Exception as exc:
            raise CalendarServiceError('Google Calendar event deletion failed.') from exc

    def _list_events_for_window(
        self,
        service,
        calendar_ids: tuple[str, ...],
        tzinfo,
        time_min: str,
        time_max: Optional[str],
        max_results: int,
        error_message: str,
    ) -> list[CalendarEvent]:
        aggregated_events: list[CalendarEvent] = []
        first_error: Optional[Exception] = None
        successful_reads = 0

        for calendar_id in calendar_ids:
            try:
                request_kwargs = {
                    'calendarId': calendar_id,
                    'timeMin': time_min,
                    'singleEvents': True,
                    'orderBy': 'startTime',
                    'maxResults': max_results,
                }
                if time_max is not None:
                    request_kwargs['timeMax'] = time_max

                response = service.events().list(**request_kwargs).execute()
                successful_reads += 1
                aggregated_events.extend(
                    self._normalize_event(item, tzinfo, calendar_id)
                    for item in response.get('items', [])
                )
            except Exception as exc:
                if first_error is None:
                    first_error = exc
                continue

        if successful_reads == 0:
            raise CalendarServiceError(error_message) from first_error

        aggregated_events.sort(key=self._calendar_event_sort_key)
        return aggregated_events[:max_results]

    def _build_service(self, interactive: bool):
        if self._service is not None:
            return self._service

        google_modules = self._import_google_modules()
        credentials = self._load_credentials(google_modules, interactive=interactive)

        try:
            self._service = google_modules['build'](
                'calendar',
                'v3',
                credentials=credentials,
                cache_discovery=False,
            )
        except Exception as exc:
            raise CalendarServiceError('Google Calendar client initialization failed.') from exc

        return self._service

    def _auth_debug(self, message: str) -> None:
        print(f'[google-calendar-auth] {message}', flush=True)

    def _save_credentials_token(self, credentials, token_path: Path) -> None:
        token_path.parent.mkdir(parents=True, exist_ok=True)
        self._auth_debug(f'Preparando para salvar token em: {token_path}')

        token_payload = credentials.to_json()
        try:
            with tempfile.NamedTemporaryFile(
                'w',
                encoding='utf-8',
                dir=token_path.parent,
                delete=False,
            ) as temp_file:
                temp_file.write(token_payload)
                temp_name = temp_file.name

            Path(temp_name).replace(token_path)
            token_path.chmod(0o600)
            self._auth_debug(
                f'Token salvo em: {token_path} (bytes={token_path.stat().st_size})'
            )
        except Exception as exc:
            self._auth_debug(
                f'Falha ao salvar token em {token_path}: {type(exc).__name__}: {exc}'
            )
            raise CalendarConfigurationError(
                f'Google Calendar token.json could not be saved at {token_path}.'
            ) from exc

        if not token_path.exists() or token_path.stat().st_size == 0:
            self._auth_debug(f'Token ausente ou vazio apos salvamento em: {token_path}')
            raise CalendarConfigurationError(
                f'Google Calendar token.json was not persisted at {token_path}.'
            )

        self._auth_debug(f'Persistencia de token confirmada em: {token_path}')

    def _load_credentials(self, google_modules: dict[str, Any], interactive: bool):
        credentials = None
        token_path = self._resolve_path(self.settings.token_path)

        if token_path.exists():
            self._auth_debug(f'Tentando carregar token existente de: {token_path}')
            try:
                credentials = google_modules['Credentials'].from_authorized_user_file(
                    str(token_path),
                    CALENDAR_SCOPES,
                )
            except Exception as exc:
                self._auth_debug(
                    f'Falha ao carregar token existente: {type(exc).__name__}: {exc}'
                )
                raise CalendarAuthError('Google Calendar token.json is invalid.') from exc

        if credentials and credentials.valid:
            self._auth_debug('Token existente carregado com sucesso e esta valido.')
            return credentials

        if credentials and credentials.expired and credentials.refresh_token:
            self._auth_debug('Token existente expirado. Tentando refresh antes de reutilizar.')
            try:
                credentials.refresh(google_modules['Request']())
                self._save_credentials_token(credentials, token_path)
                self._auth_debug('Refresh do token concluido com sucesso.')
                return credentials
            except Exception as exc:
                self._auth_debug(
                    f'Falha no refresh do token: {type(exc).__name__}: {exc}'
                )
                raise CalendarAuthError('Google Calendar token refresh failed.') from exc

        if not interactive:
            if not token_path.exists():
                raise CalendarAuthError(
                    f'Google Calendar token.json was not found at {token_path}.'
                )
            raise CalendarAuthError(
                f'Google Calendar token.json is unavailable or invalid at {token_path}.'
            )

        credentials_path = self._resolve_path(self.settings.credentials_path)
        if not credentials_path.exists():
            raise CalendarConfigurationError(
                f'Google Calendar credentials.json was not found at {credentials_path}.'
            )

        try:
            self._auth_debug(
                'Abrindo fluxo OAuth local. '
                f'credentials_path={credentials_path} token_path={token_path}'
            )
            flow = google_modules['InstalledAppFlow'].from_client_secrets_file(
                str(credentials_path),
                CALENDAR_SCOPES,
            )
            credentials = flow.run_local_server(
                host='localhost',
                port=0,
                open_browser=False,
                authorization_prompt_message='Abra esta URL no navegador para autorizar o bot: {url}',
                success_message='Autenticacao concluida. Voce ja pode voltar para o terminal.',
            )
            self._auth_debug(
                'Fluxo OAuth retornou credenciais. '
                f'valid={credentials.valid} has_refresh_token={bool(credentials.refresh_token)}'
            )
            self._save_credentials_token(credentials, token_path)
            self._auth_debug('Fluxo OAuth finalizado com token persistido.')
        except CalendarConfigurationError:
            raise
        except Exception as exc:
            self._auth_debug(
                f'Falha no fluxo OAuth: {type(exc).__name__}: {exc}'
            )
            raise CalendarAuthError('Google Calendar OAuth flow failed.') from exc

        return credentials

    def _import_google_modules(self) -> dict[str, Any]:
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise CalendarDependenciesError(
                'Google Calendar client dependencies are missing.'
            ) from exc

        return {
            'Request': Request,
            'Credentials': Credentials,
            'InstalledAppFlow': InstalledAppFlow,
            'build': build,
        }

    def _normalize_event(
        self,
        event: dict[str, Any],
        tzinfo,
        source_calendar_id: Optional[str] = None,
    ) -> CalendarEvent:
        start_data = event.get('start', {})
        end_data = event.get('end', {})
        summary = event.get('summary') or 'Sem titulo'
        is_all_day = 'date' in start_data
        start_raw = start_data.get('dateTime') or start_data.get('date')
        end_raw = end_data.get('dateTime') or end_data.get('date')

        if is_all_day:
            start_label = 'Dia todo'
        else:
            parsed_start = self._parse_datetime(start_data.get('dateTime'))
            start_label = (
                parsed_start.astimezone(tzinfo).strftime('%H:%M')
                if parsed_start
                else 'Horario indefinido'
            )

        return CalendarEvent(
            event_id=event.get('id', ''),
            summary=summary,
            start_label=start_label,
            start_raw=start_raw,
            end_raw=end_raw,
            is_all_day=is_all_day,
            location=event.get('location'),
            html_link=event.get('htmlLink'),
            source_calendar_id=source_calendar_id,
        )

    def _build_event_payload(
        self,
        summary: str,
        start_at: datetime | date,
        end_at: datetime | date,
        description: Optional[str],
        location: Optional[str],
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {'summary': summary}
        if description:
            payload['description'] = description
        if location:
            payload['location'] = location

        if isinstance(start_at, datetime) and isinstance(end_at, datetime):
            timezone_name = self.settings.timezone
            payload['start'] = {
                'dateTime': start_at.astimezone(self._get_timezone()).isoformat(),
                'timeZone': timezone_name,
            }
            payload['end'] = {
                'dateTime': end_at.astimezone(self._get_timezone()).isoformat(),
                'timeZone': timezone_name,
            }
            return payload

        if isinstance(start_at, date) and isinstance(end_at, date):
            payload['start'] = {'date': start_at.isoformat()}
            payload['end'] = {'date': end_at.isoformat()}
            return payload

        raise ValueError('start_at and end_at must both be date or both be datetime.')

    def _parse_datetime(self, raw_value: Optional[str]) -> Optional[datetime]:
        if not raw_value:
            return None

        normalized_value = raw_value.replace('Z', '+00:00')
        try:
            return datetime.fromisoformat(normalized_value)
        except ValueError:
            return None

    def _calendar_event_sort_key(self, event: CalendarEvent):
        tzinfo = self._get_timezone()
        if event.is_all_day:
            try:
                start_day = date.fromisoformat((event.start_raw or '')[:10])
                return (datetime.combine(start_day, time.min, tzinfo), event.summary)
            except ValueError:
                pass

        parsed_start = self._parse_datetime(event.start_raw)
        if parsed_start is not None:
            return (parsed_start.astimezone(tzinfo), event.summary)

        fallback = datetime.max.replace(tzinfo=tzinfo)
        return (fallback, event.summary)

    def _get_timezone(self):
        try:
            return ZoneInfo(self.settings.timezone)
        except ZoneInfoNotFoundError:
            return datetime.now().astimezone().tzinfo

    def _resolve_path(self, raw_path: str) -> Path:
        return resolve_project_path(raw_path)



def build_google_calendar_settings_from_env() -> GoogleCalendarSettings:
    calendar_id = os.getenv('GOOGLE_CALENDAR_ID', 'primary')
    return normalize_google_calendar_settings(
        GoogleCalendarSettings(
            credentials_path=os.getenv(
                'GOOGLE_CALENDAR_CREDENTIALS_PATH',
                DEFAULT_CREDENTIALS_FILENAME,
            ),
            token_path=os.getenv(
                'GOOGLE_CALENDAR_TOKEN_PATH',
                DEFAULT_TOKEN_FILENAME,
            ),
            calendar_id=calendar_id,
            calendar_ids=parse_google_calendar_ids(
                os.getenv('GOOGLE_CALENDAR_IDS'),
                fallback_calendar_id=calendar_id,
            ),
            timezone=os.getenv('GOOGLE_CALENDAR_TIMEZONE', DEFAULT_CALENDAR_TIMEZONE),
        )
    )
