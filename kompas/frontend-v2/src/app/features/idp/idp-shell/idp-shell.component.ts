import { Component, computed, inject, DestroyRef, Type, signal, effect, isDevMode, DOCUMENT } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { IdpStoreService } from '../../../core/state/idp-store.service';
import { IdpWorkflowService } from '../services/idp-workflow.service';
import { AuthService } from '../../../core/auth/auth.service';
import { StageWidgetComponent } from '../../../shared/components/stage-widget/stage-widget.component';
import { EmployeeInfoDialogComponent } from '../employee-info/employee-info-dialog.component';
import { environment } from '../../../environments/environment';
import { IdpTaskDraft } from '../../../models/idp.models';

@Component({
  selector: 'app-idp-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    StageWidgetComponent,
  ],
  template: `
    <div class="shell">
      <!-- Верхняя полоса Red elephant -->
      <header class="re-topbar">
        <span class="re-grid" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.3 6.7h3.4V3.3H3.3v3.4Zm5 10h3.4v-3.4H8.3v3.4Zm-1.6 0H3.3v-3.4h3.4v3.4Zm-3.4-5h3.4V8.3H3.3v3.4Zm8.4 0H8.3V8.3h3.4v3.4ZM13.3 3.3v3.4h3.4V3.3h-3.4Zm-1.6 3.4H8.3V3.3h3.4v3.4Zm1.6 5h3.4V8.3h-3.4v3.4Zm3.4 5h-3.4v-3.4h3.4v3.4Z"/></svg>
        </span>
        <span class="re-logo" aria-label="Red elephant">
          <svg viewBox="0 0 67 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M41.4668 11.168C42.2998 11.1681 42.9503 11.4252 43.4219 11.9395C43.8916 12.4558 44.127 13.1704 44.127 14.0801C44.1269 14.6989 44.02 15.2248 43.8057 15.6572C43.5913 16.0877 43.2878 16.4235 42.8945 16.6602C42.5013 16.8968 42.024 17.0156 41.4668 17.0156C40.8815 17.0156 40.4154 16.8628 40.0557 16.5664V18.7686L38.3008 19.2441V11.3057H39.6318L39.833 11.8301C39.9374 11.7089 40.0512 11.6003 40.1816 11.5127C40.5247 11.2815 40.9541 11.168 41.4668 11.168ZM65.1865 11.3066H66.7236V12.7979H65.1865V14.7588C65.1865 14.9881 65.2481 15.1631 65.3711 15.2861C65.4941 15.4072 65.6692 15.4688 65.8984 15.4688C66.0213 15.4687 66.1385 15.4538 66.2539 15.4277C66.3695 15.4016 66.4859 15.3702 66.5996 15.3311L67 16.7441C66.5787 16.9287 66.1047 17.0205 65.5771 17.0205C64.897 17.0204 64.3697 16.8316 63.9951 16.457C63.6186 16.0823 63.4316 15.5544 63.4316 14.874V12.7979H62.5146V11.3066H63.4316V9.7666L65.1865 9.35645V11.3066ZM26.0479 11.168C26.9202 11.168 27.6103 11.424 28.1211 11.9385C28.6297 12.4492 28.8828 13.1576 28.8828 14.0596C28.8828 14.1453 28.8817 14.2329 28.8779 14.3242C28.8742 14.4156 28.8645 14.5182 28.8496 14.6338H24.793C24.8489 14.8798 24.9443 15.0865 25.0859 15.2412C25.3246 15.5003 25.6637 15.6309 26.1074 15.6309C26.3982 15.6309 26.6366 15.5802 26.8193 15.4814C27.002 15.3826 27.1628 15.2564 27.3008 15.1035L28.7451 15.7109C28.156 16.5834 27.2686 17.0195 26.083 17.0195C25.1417 17.0195 24.4053 16.7624 23.874 16.2461C23.3428 15.7298 23.0762 15.0084 23.0762 14.084C23.0762 13.4949 23.1992 12.98 23.4434 12.54C23.6876 12.1001 24.0329 11.7612 24.4766 11.5244C24.9202 11.2877 25.4439 11.168 26.0479 11.168ZM34.8467 11.168C35.7191 11.168 36.4091 11.424 36.9199 11.9385C37.4286 12.4492 37.6816 13.1575 37.6816 14.0596C37.6816 14.1453 37.6805 14.2329 37.6768 14.3242C37.673 14.4156 37.6633 14.5182 37.6484 14.6338H33.5918C33.6477 14.8798 33.7431 15.0865 33.8848 15.2412C34.1234 15.5003 34.4626 15.6308 34.9062 15.6309C35.197 15.6309 35.4355 15.5802 35.6182 15.4814C35.8009 15.3826 35.9617 15.2564 36.0996 15.1035L37.5439 15.7109C36.9549 16.5834 36.0675 17.0195 34.8818 17.0195C33.9406 17.0195 33.2041 16.7624 32.6729 16.2461C32.1417 15.7298 31.8751 15.0084 31.875 14.084C31.875 13.4949 31.998 12.98 32.2422 12.54C32.4864 12.1001 32.8317 11.7612 33.2754 11.5244C33.719 11.2877 34.2427 11.168 34.8467 11.168ZM53.3262 11.168C54.1762 11.168 54.8232 11.3733 55.2725 11.7871C55.7199 12.1991 55.9434 12.8069 55.9434 13.6104V16.8799H54.6133L54.4209 16.377C54.296 16.5111 54.1543 16.6266 53.9922 16.7197C53.6493 16.9191 53.2465 17.0175 52.7881 17.0176C52.1543 17.0176 51.647 16.8515 51.2686 16.5234C50.8903 16.1935 50.7002 15.7539 50.7002 15.2041C50.7002 14.6299 50.9066 14.1841 51.3242 13.8672C51.7399 13.5503 52.3197 13.3916 53.0615 13.3916C53.4939 13.3916 53.882 13.4625 54.2324 13.5967V13.5078C54.2324 13.2172 54.1468 12.9935 53.9756 12.8369C53.8041 12.6803 53.5484 12.6016 53.2129 12.6016C52.937 12.6016 52.6886 12.6394 52.4668 12.7158C52.2452 12.7922 52.0309 12.8851 51.8242 12.9912L50.9756 11.7871C51.6783 11.3752 52.4613 11.168 53.3262 11.168ZM60.0264 11.168C60.7066 11.168 61.2414 11.3659 61.6328 11.7666C62.0224 12.1637 62.2188 12.7119 62.2188 13.4072V16.8818H60.4619V13.5674C60.4619 13.2915 60.3874 13.0788 60.2383 12.9297C60.0892 12.7807 59.8764 12.7061 59.6006 12.7061C59.1571 12.7062 58.7916 12.8872 58.499 13.2432V16.8818H56.7451V11.3057H58.0762L58.2939 11.873C58.7097 11.407 59.2844 11.168 60.0264 11.168ZM31.2559 16.8799H29.502V9.65234L31.2559 9.11914V16.8799ZM46.501 11.6699C46.8943 11.3381 47.402 11.168 48.0283 11.168C48.7067 11.168 49.2433 11.3659 49.6348 11.7646C50.0244 12.1617 50.2207 12.7099 50.2207 13.4053V16.8799H48.4639V13.5654C48.4639 13.2896 48.3894 13.0769 48.2402 12.9277C48.0912 12.7789 47.879 12.7042 47.6035 12.7041C47.1598 12.7041 46.7937 12.8852 46.501 13.2412V16.8799H44.7471V9.22168L46.501 8.72461V11.6699ZM10.4834 0L10.9434 0.00195312C13.0396 0.163662 14.9968 1.128 16.4941 2.70605C18.0162 4.31012 18.8808 6.40715 19.0137 8.6543L19.0068 13.5166L15.29 14.7041V11.8809L16.2988 11.5479V9.23828C16.2988 5.74777 13.6056 2.81472 10.2939 2.81445H7.70996V6.37402L9.66113 8.65234L14.0342 7.25781V10.082L12.9922 10.4121V16.2969H0V3.83301L5.04688 2.1875V0H10.4834ZM53.373 14.5195C53.0823 14.5195 52.8566 14.5756 52.6963 14.6855C52.536 14.7955 52.4561 14.9542 52.4561 15.1611C52.4561 15.3586 52.5286 15.515 52.6738 15.625C52.8192 15.735 53.0189 15.791 53.2705 15.791C53.4756 15.791 53.6643 15.7468 53.832 15.6592C53.9848 15.579 54.1169 15.4574 54.2324 15.3027V14.7217C53.9808 14.5893 53.6955 14.5195 53.373 14.5195ZM41.1084 12.7041C40.8717 12.7041 40.6645 12.7526 40.4893 12.8477C40.3272 12.9371 40.1841 13.0698 40.0537 13.2393V14.9355C40.3184 15.2878 40.6685 15.4687 41.1084 15.4688C41.3618 15.4688 41.5779 15.4145 41.7568 15.3027C41.9377 15.1927 42.0758 15.0362 42.1709 14.833C42.266 14.6298 42.3144 14.3802 42.3125 14.0801C42.3125 13.6607 42.2065 13.3251 41.9922 13.0771C41.7778 12.8292 41.4831 12.7041 41.1084 12.7041ZM2.70215 5.80664V13.4688H10.2363V11.29L8.61719 11.8027L5.04883 7.58008V5.04297L2.70215 5.80664ZM26.0498 12.4971C25.774 12.4971 25.5373 12.5608 25.3379 12.6875C25.1385 12.8123 24.9873 12.9949 24.8848 13.2314C24.8533 13.3017 24.8289 13.3795 24.8066 13.459H27.1865C27.1642 13.3436 27.1347 13.2355 27.0938 13.1387C27.0024 12.9262 26.8697 12.7635 26.6982 12.6572C26.525 12.5511 26.3087 12.4971 26.0498 12.4971ZM34.8486 12.4971C34.5728 12.4971 34.3362 12.5608 34.1367 12.6875C33.9373 12.8123 33.7861 12.9948 33.6836 13.2314C33.6522 13.3017 33.6277 13.3795 33.6055 13.459H35.9854C35.963 13.3436 35.9335 13.2355 35.8926 13.1387C35.8012 12.9262 35.6686 12.7635 35.4971 12.6572C35.3238 12.5511 35.1076 12.4971 34.8486 12.4971ZM32.8389 2.44434C33.7113 2.44434 34.4012 2.69931 34.9102 3.21191C35.419 3.72263 35.6728 4.43091 35.6729 5.33301C35.6729 5.41863 35.6707 5.50646 35.667 5.59766C35.6633 5.68891 35.6545 5.79179 35.6396 5.90723H31.585C31.6409 6.1533 31.7353 6.3609 31.877 6.51562C32.1155 6.77463 32.455 6.9052 32.8984 6.90527C33.1892 6.90527 33.4286 6.85466 33.6113 6.75586C33.7939 6.65708 33.9539 6.52975 34.0918 6.37695L35.5371 6.98535C34.9481 7.85768 34.0604 8.29385 32.875 8.29395C31.9336 8.29395 31.1973 8.03411 30.666 7.52148C30.1347 7.00511 29.8682 6.28401 29.8682 5.35938C29.8682 4.77033 29.9912 4.25536 30.2354 3.81543C30.4795 3.37576 30.8241 3.03646 31.2676 2.7998C31.7112 2.5631 32.235 2.44438 32.8389 2.44434ZM41.8672 8.15625H40.5361L40.335 7.63184C40.2306 7.753 40.1168 7.86161 39.9863 7.94922C39.6435 8.1783 39.2111 8.29387 38.6914 8.29395C37.8658 8.29395 37.2168 8.03465 36.7471 7.51855C36.2773 7.00218 36.042 6.2801 36.042 5.35547C36.042 4.75182 36.1481 4.23195 36.3623 3.7959C36.5767 3.36155 36.8811 3.02599 37.2744 2.79297C37.6678 2.55995 38.1415 2.44238 38.6914 2.44238C39.2784 2.44247 39.7499 2.5951 40.1133 2.8877V0.529297L41.8672 0V8.15625ZM26.8779 0.449219C27.7632 0.449296 28.4467 0.664113 28.9238 1.09277C29.4029 1.52151 29.6416 2.14362 29.6416 2.96191C29.6416 3.49677 29.5282 3.95154 29.3027 4.32617C29.0772 4.70077 28.7565 4.98609 28.3447 5.18555C28.231 5.23961 28.1092 5.28702 27.9824 5.32617L29.8691 8.15527H27.7705L26.0908 5.48242H25.2812V8.15723H23.4697V0.449219H26.8779ZM39.0566 3.98145C38.8031 3.98145 38.5862 4.03747 38.4072 4.14746C38.2283 4.25744 38.0902 4.41616 37.9951 4.62305C37.9001 4.82804 37.8516 5.0742 37.8516 5.35742C37.8516 5.79351 37.9565 6.13471 38.167 6.37891C38.3776 6.62311 38.6745 6.74609 39.0566 6.74609C39.2857 6.74605 39.4904 6.69751 39.6748 6.60254C39.8444 6.51492 39.9883 6.38253 40.1113 6.21289V4.5166C39.8467 4.16265 39.4982 3.98154 39.0566 3.98145ZM32.8408 3.77344C32.5651 3.77347 32.3283 3.83621 32.1289 3.96289C31.9294 4.08779 31.7783 4.27106 31.6758 4.50781C31.6442 4.58043 31.6201 4.65716 31.5996 4.73535H33.9785C33.9561 4.61977 33.9258 4.511 33.8848 4.41406C33.7935 4.20187 33.6614 4.03981 33.4902 3.93359C33.3169 3.82734 33.0999 3.77344 32.8408 3.77344ZM25.2803 3.94434H26.7139C27.0585 3.94426 27.3193 3.86008 27.5 3.69238C27.6807 3.52461 27.7705 3.27854 27.7705 2.95801C27.7704 2.65431 27.6789 2.41576 27.5 2.24805C27.3193 2.08039 27.0585 1.99617 26.7139 1.99609H25.2803V3.94434Z" fill="white"/></svg>
        </span>
        <span class="re-right">
          <span class="re-user">{{ auth.initials() }}</span>
          <mat-icon class="re-ic" aria-hidden="true">account_circle</mat-icon>
          <mat-icon class="re-ic re-bell" aria-hidden="true">notifications_none</mat-icon>
          <button
            mat-icon-button
            class="re-logout"
            (click)="logout()"
            matTooltip="Выйти"
            aria-label="Выйти"
          >
            <mat-icon>logout</mat-icon>
          </button>
        </span>
      </header>

      <!-- Подшапка «Оценка» -->
      <div class="idp-subbar">
        <span class="subbar-badge" aria-hidden="true">
          <svg viewBox="0 0 22 21" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.625 10.9358L8.175 9.51084C7.99167 9.3275 7.7625 9.23584 7.4875 9.23584C7.2125 9.23584 6.975 9.33584 6.775 9.53584C6.59167 9.71917 6.5 9.9525 6.5 10.2358C6.5 10.5192 6.59167 10.7525 6.775 10.9358L8.925 13.0858C9.125 13.2858 9.35833 13.3858 9.625 13.3858C9.89167 13.3858 10.125 13.2858 10.325 13.0858L14.575 8.83584C14.775 8.63584 14.8708 8.4025 14.8625 8.13584C14.8542 7.86917 14.7583 7.63584 14.575 7.43584C14.375 7.23584 14.1375 7.13167 13.8625 7.12334C13.5875 7.115 13.35 7.21084 13.15 7.41084L9.625 10.9358ZM6.825 19.9858L5.375 17.5358L2.625 16.9358C2.375 16.8858 2.175 16.7567 2.025 16.5483C1.875 16.34 1.81667 16.1108 1.85 15.8608L2.125 13.0358L0.25 10.8858C0.0833333 10.7025 0 10.4858 0 10.2358C0 9.98584 0.0833333 9.76917 0.25 9.58584L2.125 7.43584L1.85 4.61084C1.81667 4.36084 1.875 4.13167 2.025 3.92334C2.175 3.715 2.375 3.58584 2.625 3.53584L5.375 2.93584L6.825 0.485836C6.95833 0.26917 7.14167 0.123336 7.375 0.0483364C7.60833 -0.0266636 7.84167 -0.0141636 8.075 0.0858364L10.675 1.18584L13.275 0.0858364C13.5083 -0.0141636 13.7417 -0.0266636 13.975 0.0483364C14.2083 0.123336 14.3917 0.26917 14.525 0.485836L15.975 2.93584L18.725 3.53584C18.975 3.58584 19.175 3.715 19.325 3.92334C19.475 4.13167 19.5333 4.36084 19.5 4.61084L19.225 7.43584L21.1 9.58584C21.2667 9.76917 21.35 9.98584 21.35 10.2358C21.35 10.4858 21.2667 10.7025 21.1 10.8858L19.225 13.0358L19.5 15.8608C19.5333 16.1108 19.475 16.34 19.325 16.5483C19.175 16.7567 18.975 16.8858 18.725 16.9358L15.975 17.5358L14.525 19.9858C14.3917 20.2025 14.2083 20.3483 13.975 20.4233C13.7417 20.4983 13.5083 20.4858 13.275 20.3858L10.675 19.2858L8.075 20.3858C7.84167 20.4858 7.60833 20.4983 7.375 20.4233C7.14167 20.3483 6.95833 20.2025 6.825 19.9858ZM8.125 18.1858L10.675 17.0858L13.275 18.1858L14.675 15.7858L17.425 15.1358L17.175 12.3358L19.025 10.2358L17.175 8.08584L17.425 5.28584L14.675 4.68584L13.225 2.28584L10.675 3.38584L8.075 2.28584L6.675 4.68584L3.925 5.28584L4.175 8.08584L2.325 10.2358L4.175 12.3358L3.925 15.1858L6.675 15.7858L8.125 18.1858Z" fill="#343C47"/></svg>
        </span>
        <span class="subbar-title">Оценка</span>
        <nav class="subbar-nav">
          <a href="#" (click)="$event.preventDefault()">Система оценки</a>
          <a href="#" (click)="$event.preventDefault()" class="on">План развития</a>
          <a href="#" (click)="$event.preventDefault()">Помощь</a>
        </nav>
      </div>

      <div class="shell-body">
        <main class="main-content">
          <div class="main-scroll">
            <router-outlet />
          </div>
        </main>

        <!-- Правая панель статуса: язычок-бургер справа, раскрывается по наведению; клик — закрепляет -->
        <aside class="idp-rail" aria-label="Статус ИПР">
          <div class="rail-body">
          <div class="rail-header">
            <span class="rail-header__employee">{{ store.context()?.fullName || '—' }}</span>
            <span class="rail-header__stage">{{ currentStageLabel() }}</span>
            <button
              type="button"
              class="rail-toggle"
              [attr.aria-expanded]="!railCollapsed()"
              aria-controls="rail-collapsible"
              (click)="railCollapsed.set(!railCollapsed())"
            >
              <mat-icon [class.is-expanded]="!railCollapsed()">expand_more</mat-icon>
            </button>
          </div>

          <div class="rail-collapsible" id="rail-collapsible" [class.rail-collapsed]="railCollapsed()">
            <div class="rail-scroll">
              <section class="rail-card">
                <span class="rail-chip rail-chip--brand">ИПР</span>
                <h2 class="rail-card__title">Статус ИПР:</h2>

                <app-stage-widget
                  [currentStage]="store.currentStage()"
                  [steps]="store.stageLabels()"
                  (navigate)="onStageNavigate($event)"
                />

                <div class="rail-manager">
                  <span class="rail-manager__label">Руководитель:</span>
                  <span class="rail-manager__name">{{ store.context()?.managerFullName || '—' }}</span>
                </div>
              </section>

              @if (noticeVisible() && !noticeDismissedForever()) {
                <section
                  class="rail-unsaved"
                  [class.is-expanded]="noticeExpanded()"
                  aria-label="Несохранённые изменения"
                >
                  <div class="rail-unsaved__header">
                    <button
                      type="button"
                      class="rail-unsaved__toggle"
                      [attr.aria-expanded]="noticeExpanded()"
                      aria-controls="rail-unsaved-body"
                      (click)="noticeExpanded.set(!noticeExpanded())"
                    >
                      <span class="rail-unsaved__title">Есть несохранённые изменения</span>
                    </button>
                    <button
                      type="button"
                      class="rail-unsaved__close"
                      (click)="onNoticeClose($event)"
                      aria-label="Скрыть"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>

                  @if (noticeExpanded()) {
                    <div id="rail-unsaved-body" class="rail-unsaved__body">
                      <mat-icon class="rail-unsaved__icon">warning</mat-icon>
                      <div class="rail-unsaved__content">
                        <p class="rail-unsaved__text">
                          Создайте изменения в черновике. Нажмите «Сохранить», чтобы не допустить потери информации. Автоматическое сохранение введённых данных не производится.
                        </p>
                        <button
                          type="button"
                          class="rail-unsaved__dismiss"
                          (click)="dismissNoticeForever()"
                        >
                          Больше не показывать
                        </button>
                      </div>
                    </div>
                  }
                </section>
              }

              @if (store.directionsCount() > 0) {
                @for (direction of store.draft().directions; track $index; let i = $index) {
                  @let status = directionStatuses()[i];
                  @let taskState = directionTasksState()[i];
                  <button
                    type="button"
                    class="rail-direction is-expanded"
                  >
                    <span class="rail-direction__header">
                      <span
                        class="rail-direction__arrow is-visible"
                        aria-hidden="true"
                      >→</span>
                      <span
                        class="rail-direction__goal"
                        [matTooltip]="direction.goal || direction.description || ''"
                        matTooltipPosition="left"
                        matTooltipShowDelay="300"
                      >Направление {{ i + 1 }}</span>
                      @switch (status) {
                        @case ('filled') {
                          <span class="rail-chip rail-chip--done">
                            ЗАПОЛНЕНО
                            <mat-icon>check</mat-icon>
                          </span>
                        }
                        @case ('progress') {
                          <span class="rail-chip rail-chip--progress">
                            В ПРОЦЕССЕ
                            <mat-icon>more_horiz</mat-icon>
                          </span>
                        }
                      }
                    </span>

                    @if (direction.tasks.length > 0) {
                      <span class="rail-direction__tasks">
                        @for (task of direction.tasks; track $index; let ti = $index) {
                          <span
                            class="rail-task"
                            [class.is-completed]="taskState?.filled?.[ti]"
                            [class.is-active]="taskState?.firstUnfilledIndex === ti"
                          >
                            <span
                              class="rail-task__label"
                              [matTooltip]="task.description || task.developmentTool || ''"
                              matTooltipPosition="left"
                              matTooltipShowDelay="300"
                            >Действие {{ ti + 1 }}</span>
                            @if (taskState?.filled?.[ti]) {
                              <mat-icon>check</mat-icon>
                            }
                            @if (taskState?.firstUnfilledIndex === ti) {
                              <mat-icon>more_horiz</mat-icon>
                            }
                          </span>
                        }
                      </span>
                    }
                  </button>
                }
              }
            </div>

            <!-- Кнопка прижата к низу панели -->
            <button
              mat-flat-button
              class="rail-info-btn"
              type="button"
              [disabled]="!store.context()"
              (click)="openEmployeeInfo()"
            >
              <mat-icon>info</mat-icon>
              <span class="rail-info-btn__label">Информация о сотруднике</span>
            </button>
          </div>
          </div>
        </aside>
      </div>
    </div>

    <!-- Dev tools FAB (lazy route extraction plan §7.3; renders only in non-production).
         H5: loaded via dynamic import so DevToolsComponent (and MockDataService)
         never enter the prod bundle — environment replacement makes the ctor
         branch statically false in production and the import is tree-shaken. -->
    @if (devToolsComponent(); as devToolsType) {
      <ng-container [ngComponentOutlet]="devToolsType" />
    }
  `,
  styles: [`
    .shell{display:flex;flex-direction:column;height:100vh;background:var(--background-color)}
    /* Верхняя полоса Red elephant */
    .re-topbar{flex:0 0 auto;display:flex;align-items:center;gap:0;height:32px;padding:0;background:#343C47;color:#cfd4db}
    .re-grid{display:flex;align-items:center;justify-content:center;width:40px;height:32px;color:#aab1bb;flex:0 0 auto}
    .re-grid svg{width:16px;height:16px;display:block}
    .re-logo{align-self:stretch;display:flex;align-items:center;background:#e11d44;padding:0 10px}
    .re-logo svg{height:15px;width:auto;display:block}
    .re-right{margin-left:auto;display:flex;align-items:center;gap:16px;padding-right:20px}
    .re-user{font:400 13px/16px var(--font-regular);letter-spacing:.3px;white-space:nowrap}
    .re-ic{width:17px;height:17px;font-size:17px;color:#aab1bb}
    .re-bell{position:relative}
    .re-logout{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;line-height:0;color:#aab1bb}
    .re-logout mat-icon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;font-size:18px;line-height:0}
    /* Подшапка «Оценка» */
    .idp-subbar{flex:0 0 auto;display:flex;align-items:center;gap:14px;height:60px;min-height:60px;padding:0 26px;background:#d8dce1;color:#1f2733;position:sticky;top:0;z-index:100}
    .subbar-badge{display:grid;place-items:center;flex:0 0 auto}
    .subbar-badge svg{width:24px;height:auto;display:block}
    .subbar-title{margin:0;font:500 21px/28px var(--font-medium);font-weight:700;letter-spacing:.1px}
    .subbar-nav{margin-left:auto;display:flex;gap:30px;font-size:15px}
    .subbar-nav a{color:#6b7682;text-decoration:none}
    .subbar-nav a:hover{text-decoration:none;color:#39424e}
    .subbar-nav a.on{color:#1f2733;font-weight:700}
    .shell-body{flex:1 1 auto;min-height:0;display:flex}
    .main-content{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
    .main-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;padding-bottom:0}

    .rail-header{display:none;align-items:center;gap:12px;height:44px;padding:0 4px;color:#fff}
    .rail-header__employee{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 14px/20px var(--font-medium)}
    .rail-header__stage{flex:0 0 auto;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:400 13px/18px var(--font-regular);color:rgba(255,255,255,.75)}
    .rail-toggle{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;background:transparent;border:none;border-radius:var(--radius-md);color:#fff;cursor:pointer}
    .rail-toggle mat-icon{width:20px;height:20px;font-size:20px;transition:transform .2s ease}
    .rail-toggle mat-icon.is-expanded{transform:rotate(180deg)}
    .rail-collapsible{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:12px}
    .rail-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px}

    .rail-info-btn ::ng-deep .mdc-button__label{display:flex;align-items:center;min-width:0;overflow:hidden}

    @media (max-width:1200px){
      .shell-body{display:flex;flex-direction:column;grid-template-columns:none}
      .main-content{flex:1 1 auto;min-height:0;width:100%}
      .toolbar-rail-btn{display:none}
      .idp-rail{order:-1;position:static;transform:none;pointer-events:auto;flex-direction:column;top:auto;bottom:auto;right:auto;z-index:auto;flex:0 0 auto;width:100%;min-width:0;height:auto;max-height:40vh}
      .rail-body{width:100%;min-width:0;max-height:40vh;overflow-y:auto;padding:0;box-shadow:none}
      .rail-header{display:flex;height:44px;padding:0 12px}
      .rail-collapsible.rail-collapsed{display:none}
      .rail-collapsible:not(.rail-collapsed){display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);align-items:start;gap:12px;padding:12px}
      .rail-collapsible:not(.rail-collapsed) .rail-scroll{display:contents}
      .rail-card{grid-column:1}
      .rail-help,.rail-direction{grid-column:2}
      .rail-unsaved{grid-column:1/-1}
      .rail-info-btn{grid-column:1/-1;margin-top:0}
      .main-scroll{padding-bottom:120px}
    }
  `],
})
export class IdpShellComponent {
  readonly store = inject(IdpStoreService);
  readonly workflow = inject(IdpWorkflowService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  /** H5: DevTools component resolved lazily outside production only. */
  readonly devToolsComponent = signal<Type<unknown> | null>(null);

  /** Collapse state for the narrow-viewport horizontal rail (<1200px only). */
  readonly railCollapsed = signal(true);

  /** Label of the current stage shown in the narrow rail header. */
  readonly currentStageLabel = computed(() => {
    const stage = this.store.currentStage();
    const label = this.store.stageLabels().find((s) => s.stage === stage);
    return label?.label ?? '—';
  });

  /** Derived status for every direction: filled / progress / empty. */
  readonly directionStatuses = computed(() => {
    return this.store.draft().directions.map((direction) => {
      const hasGoal = !!direction.goal?.trim();
      const hasDescription = !!direction.description?.trim();
      const hasAnyTaskContent = direction.tasks.some(
        (t) =>
          t.developmentTool.trim() ||
          t.deadLine.trim() ||
          t.description.trim() ||
          t.comment.trim()
      );
      const hasAnyContent = hasGoal || hasDescription || hasAnyTaskContent;
      const allTasksFilled =
        direction.tasks.length > 0 && direction.tasks.every((t) => this.isTaskFilled(t));

      if (hasGoal && hasDescription && allTasksFilled) return 'filled' as const;
      if (hasAnyContent) return 'progress' as const;
      return 'empty' as const;
    });
  });

  /** Index of the single expanded direction in the rail. */
  readonly expandedDirectionIndex = computed(() => {
    const statuses = this.directionStatuses();
    const progressIndex = statuses.findIndex((s) => s === 'progress');
    if (progressIndex !== -1) return progressIndex;
    const emptyIndex = statuses.findIndex((s) => s === 'empty');
    return emptyIndex !== -1 ? emptyIndex : null;
  });

  /** Per-direction task filled flags and the first unfilled task index. */
  readonly directionTasksState = computed(() => {
    return this.store.draft().directions.map((direction) => {
      const filled = direction.tasks.map((t) => this.isTaskFilled(t));
      const firstUnfilledIndex = filled.findIndex((f) => !f);
      return {
        filled,
        firstUnfilledIndex: firstUnfilledIndex === -1 ? null : firstUnfilledIndex,
      };
    });
  });

  readonly isProduction = environment.production;

  /** Whether a task has all mandatory fields filled. */
  private isTaskFilled(task: IdpTaskDraft): boolean {
    return !!(task.developmentTool.trim() && task.deadLine.trim() && task.description.trim());
  }

  // --- Unsaved-changes notice state ---
  private readonly document = inject(DOCUMENT);
  readonly noticeVisible = signal(false);
  readonly noticeExpanded = signal(false);
  readonly noticeDismissedForever = signal(false);
  private noticeTimer: ReturnType<Window['setTimeout']> | null = null;
  private readonly noticeDelayMs = this.resolveNoticeDelay();

  constructor() {
    // Плавающая дев-кнопка (переключение мок-сценария) отключена — мешала в UI.
    // Чтобы вернуть для отладки: раскомментировать и грузить только вне production.
    // void import('../dev-tools/dev-tools.component').then((m) =>
    //   this.devToolsComponent.set(m.DevToolsComponent));

    // Init once: context + dictionaries. Guards against double init live in
    // the workflow service (safe under component recreation / dev reuse).
    void this.workflow.loadContext().catch(() => { /* store.contextError holds the failure */ });
    void this.workflow.loadDictionariesOnce();

    // Restore permanent dismissal (guarded for private-mode / disabled storage).
    try {
      this.noticeDismissedForever.set(localStorage.getItem('idp-unsaved-notice-dismissed') === '1');
    } catch {
      // ignore
    }

    // After 180 s of inactivity with unsaved changes, show the collapsed notice.
    // Every edit restarts the timer; saving clears it and hides the notice.
    effect(() => {
      this.store.draft(); // track any plan edit
      const dirty = this.store.isDirty();
      if (!dirty) {
        this.clearNoticeTimer();
        this.noticeVisible.set(false);
        this.noticeExpanded.set(false);
        return;
      }
      if (this.noticeDismissedForever()) return;

      this.clearNoticeTimer();
      this.noticeVisible.set(false);
      this.noticeExpanded.set(false);
      this.noticeTimer = this.document.defaultView?.setTimeout(() => {
        this.noticeVisible.set(true);
      }, this.noticeDelayMs) ?? null;
    });

    // Abort any active SSE stream when the user leaves the IDP section.
    inject(DestroyRef).onDestroy(() => {
      this.workflow.cancelActiveStream();
      this.clearNoticeTimer();
    });
  }

  logout(): void {
    this.auth.logout();
  }

  /** Правая панель: карточка сотрудника (контекст ИПР). */
  openEmployeeInfo(): void {
    const context = this.store.context();
    if (!context) return;

    this.dialog.open(EmployeeInfoDialogComponent, {
      data: context,
      width: '520px',
      maxWidth: '90vw',
    });
  }

  /** Футер: сохранить текущий черновик (PUT /idp/draft). */
  async savePlan(): Promise<void> {
    if (this.store.directionsCount() === 0) return;
    try {
      await this.store.updateDraftPlan({ ...this.store.draft() });
    } catch {
      // Ошибки валидации уже в store.validationErrors.
    }
  }

  /** Футер: отправить план на согласование (POST /chat/confirm). */
  async submitPlan(): Promise<void> {
    if (this.store.directionsCount() === 0) return;
    try {
      await this.workflow.confirmPlan();
    } catch {
      // Ошибки валидации уже в store.validationErrors.
    }
  }

  goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void this.router.navigate(['/idp/onboarding']);
    }
  }

  onStageNavigate(stage: Parameters<IdpWorkflowService['canActivateStage']>[0]): void {
    if (!this.workflow.canActivateStage(stage)) return;
    const routes: Record<string, string> = {
      STAGE_1_CONTEXT: '/idp/onboarding',
      STAGE_1_2_ONBOARDING: '/idp/onboarding',
      STAGE_2_QUESTIONNAIRE: '/idp/assessment',
      STAGE_3_DRAFT_GEN: '/idp/draft',
      STAGE_4_REFINEMENT: '/idp/draft',
      STAGE_5_COMPLETED: '/idp/completion',
    };
    const target = routes[stage];
    if (target) void this.router.navigate([target]);
  }

  // --- Unsaved-changes notice helpers ---

  private resolveNoticeDelay(): number {
    const defaultDelay = 180_000;
    if (!isDevMode()) return defaultDelay;
    const params = new URLSearchParams(this.document?.defaultView?.location?.search ?? '');
    const raw = params.get('noticeDelay');
    if (!raw) return defaultDelay;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return defaultDelay;
    return Math.max(1_000, Math.min(600_000, parsed));
  }

  private clearNoticeTimer(): void {
    if (this.noticeTimer !== null) {
      this.document.defaultView?.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
  }

  /** × — hide for now; the timer re-arms if changes are still unsaved. */
  onNoticeClose(event: Event): void {
    event.stopPropagation();
    this.noticeVisible.set(false);
    this.noticeExpanded.set(false);
    if (this.noticeDismissedForever() || !this.store.isDirty()) return;
    this.clearNoticeTimer();
    this.noticeTimer = this.document.defaultView?.setTimeout(() => {
      this.noticeVisible.set(true);
    }, this.noticeDelayMs) ?? null;
  }

  /** Больше не показывать — permanently dismiss and persist the choice. */
  dismissNoticeForever(): void {
    this.noticeDismissedForever.set(true);
    this.noticeVisible.set(false);
    this.noticeExpanded.set(false);
    this.clearNoticeTimer();
    try {
      localStorage.setItem('idp-unsaved-notice-dismissed', '1');
    } catch {
      // ignore
    }
  }
}
