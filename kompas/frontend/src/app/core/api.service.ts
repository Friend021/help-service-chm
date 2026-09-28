import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Idp, PriorityPatch, SessionResponse, TurnResponse } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  createSession(token: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.base}/sessions`, { token });
  }

  getSession(sessionId: number): Observable<SessionResponse> {
    return this.http.get<SessionResponse>(`${this.base}/sessions/${sessionId}`);
  }

  sendMessage(sessionId: number, text: string): Observable<TurnResponse> {
    return this.http.post<TurnResponse>(`${this.base}/sessions/${sessionId}/messages`, { text });
  }

  /** Черновик-болванка без диалога — для демонстрации переноса в «ПЛАН РАЗВИТИЯ». */
  demoDraft(sessionId: number): Observable<TurnResponse> {
    return this.http.post<TurnResponse>(`${this.base}/sessions/${sessionId}/demo-draft`, {});
  }

  updateIdp(idpId: number, priorities: PriorityPatch[]): Observable<Idp> {
    return this.http.put<Idp>(`${this.base}/idp/${idpId}`, { priorities });
  }

  submitIdp(idpId: number): Observable<Idp> {
    return this.http.post<Idp>(`${this.base}/idp/${idpId}/submit`, {});
  }

  /** Ссылка на форму «ПЛАН РАЗВИТИЯ» с уже перенесёнными приоритетами. */
  handoverIdp(idpId: number): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base}/idp/${idpId}/handover`, {});
  }

  exportIdp(idpId: number, format: 'docx' | 'json'): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.base}/idp/${idpId}/export`, {}, {
      params: { format },
      responseType: 'blob',
      observe: 'response'
    });
  }
}
