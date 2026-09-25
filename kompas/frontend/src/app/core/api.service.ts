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

  updateIdp(idpId: number, priorities: PriorityPatch[]): Observable<Idp> {
    return this.http.put<Idp>(`${this.base}/idp/${idpId}`, { priorities });
  }

  submitIdp(idpId: number): Observable<Idp> {
    return this.http.post<Idp>(`${this.base}/idp/${idpId}/submit`, {});
  }

  exportIdp(idpId: number, format: 'docx' | 'json'): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.base}/idp/${idpId}/export`, {}, {
      params: { format },
      responseType: 'blob',
      observe: 'response'
    });
  }
}
