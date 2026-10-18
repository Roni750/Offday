<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { DateTime } from 'luxon';
import { type ApiError, toApiError } from '@/api/errors';
import * as invitationsApi from '@/api/invitations';
import type { InvitationPreview } from '@/api/types';
import AppButton from '@/components/ui/AppButton.vue';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { endSession } from '@/stores/session';
import { ROLE_DESCRIPTIONS, roleLabel } from '@/utils/roles';
import {
  INVITE_TOKEN_PATTERN,
  NAME_MAX,
  PASSWORD_HINT,
  type JoinFormField,
  type JoinFormValues,
  buildJoinFormSchema,
} from '@/validation/joinForm';
import { toTypedSchema } from '@/validation/zodTypedSchema';

/**
 * `/join/:token`: create an account through an invite link. The token stays in this page; it reaches the API
 * only in request bodies. Every unusable link gets the same message, whatever the reason.
 */
const INVALID_MESSAGE = 'This invite link is invalid or has expired. Ask your admin for a new one.';
const FIELD_ORDER: JoinFormField[] = ['name', 'email', 'password'];

type State = 'loading' | 'invalid' | 'unreachable' | 'ready';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toast = useToast();

const state = ref<State>('loading');
const invite = ref<InvitationPreview | null>(null);
const invalidMessage = ref(INVALID_MESSAGE);
const loadError = ref('');
const generalError = ref<string>();
/** The email already has an account: offer to sign in instead. */
const emailTaken = ref(false);

const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''));
const place = computed(() => (invite.value ? `${invite.value.workspace.name} · ${invite.value.office.name}` : ''));
const emailLocked = computed(() => !!invite.value?.email);
const expires = computed(() => (invite.value ? DateTime.fromISO(invite.value.expiresAt).toFormat("ccc d LLL 'at' HH:mm") : ''));

// ---- Form -----------------------------------------------------------------------

const { defineField, errors, handleSubmit, resetForm, setErrors, isSubmitting } = useForm<JoinFormValues>({
  validationSchema: toTypedSchema(buildJoinFormSchema()),
  initialValues: { name: '', email: '', password: '' },
});

const [name, nameAttrs] = defineField('name');
const [email, emailAttrs] = defineField('email');
const [password, passwordAttrs] = defineField('password');
const inputs: Partial<Record<JoinFormField, HTMLInputElement | null>> = {};

// ---- Loading the invite --------------------------------------------------------

async function load(): Promise<void> {
  state.value = 'loading';
  // A malformed link can't be valid: same message, no request.
  if (!INVITE_TOKEN_PATTERN.test(token.value)) {
    state.value = 'invalid';
    return;
  }
  try {
    // A signed-in visitor is told so first; `ensureMe` never throws.
    const [preview] = await Promise.all([invitationsApi.previewInvitation(token.value), auth.ensureMe()]);
    invite.value = preview;
    resetForm({ values: { name: '', email: preview.email ?? '', password: '' } });
    state.value = 'ready';
    if (!auth.me) {
      await nextTick();
      inputs.name?.focus();
    }
  } catch (err) {
    const error = toApiError(err);
    if (error.status === 404) {
      invalidMessage.value = error.message;
      state.value = 'invalid';
    } else {
      loadError.value = error.message;
      state.value = 'unreachable';
    }
  }
}

onMounted(load);

async function signOut(): Promise<void> {
  endSession();
  await nextTick();
  inputs.name?.focus();
}

// ---- Submitting ------------------------------------------------------------------

function applyServerError(error: ApiError): void {
  if (error.status === 404) {
    invalidMessage.value = error.message;
    state.value = 'invalid';
    return;
  }
  if (error.code === 'EMAIL_TAKEN') {
    emailTaken.value = true;
    setErrors({ email: error.message });
    return;
  }
  // A personal link opened with another email (the field is locked, so only a tampered form gets here).
  if (error.code === 'FORBIDDEN') {
    setErrors({ email: error.message });
    return;
  }
  if (error.code === 'VALIDATION_ERROR' && Object.keys(error.fieldErrors).length) {
    const fieldErrors: Partial<Record<JoinFormField, string>> = {};
    const other: string[] = [];
    for (const [field, message] of Object.entries(error.fieldErrors)) {
      if ((FIELD_ORDER as string[]).includes(field)) fieldErrors[field as JoinFormField] = message;
      else other.push(message);
    }
    setErrors(fieldErrors);
    generalError.value = other.length ? other.join(' ') : undefined;
    return;
  }
  generalError.value = error.message;
}

const submit = handleSubmit(
  async (values) => {
    generalError.value = undefined;
    emailTaken.value = false;
    try {
      const me = await auth.acceptInvitation(token.value, values);
      toast.success(`Welcome to ${me.office.name}`, `You're signed in as ${me.name}.`);
      // `replace`: the link doesn't stay in the history.
      await router.replace(auth.homePath);
    } catch (err) {
      applyServerError(toApiError(err));
    }
  },
  async ({ errors: invalid }) => {
    await nextTick();
    const field = FIELD_ORDER.find((f) => invalid[f]);
    if (field) inputs[field]?.focus();
  },
);
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-8 max-sm:p-4">
    <div
      class="grid w-full max-w-[1040px] grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] overflow-hidden rounded-shell border border-line bg-surface shadow-shell"
    >
      <div class="flex flex-col gap-7 px-12 pb-10 pt-12 max-sm:px-6 max-sm:pt-8">
        <BrandLogo />

        <!-- Loading -->
        <div v-if="state === 'loading'" class="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading the invite">
          <div class="h-9 w-2/3 animate-pulse rounded-control bg-canvas" />
          <div class="h-5 w-full animate-pulse rounded-control bg-canvas" />
          <div v-for="n in 3" :key="n" class="h-[42px] animate-pulse rounded-control bg-canvas" />
        </div>

        <!-- Unusable link: one message for every reason -->
        <section v-else-if="state === 'invalid'" class="flex flex-col gap-4" aria-labelledby="join-title">
          <h1 id="join-title" class="text-[30px] font-semibold tracking-[-0.03em]">This link can’t be used</h1>
          <p role="alert" class="text-ink-3">{{ invalidMessage }}</p>
          <p class="text-[13px] text-ink-3">
            Already have an account?
            <RouterLink :to="auth.me ? auth.homePath : { name: 'login' }" class="font-medium text-ink underline underline-offset-2">
              {{ auth.me ? 'Back to Offday' : 'Sign in' }}
            </RouterLink>
          </p>
        </section>

        <!-- Server unreachable -->
        <section v-else-if="state === 'unreachable'" class="flex flex-col gap-4" aria-labelledby="join-title">
          <h1 id="join-title" class="text-[30px] font-semibold tracking-[-0.03em]">Can’t load this invite</h1>
          <p role="alert" class="text-ink-3">{{ loadError }}</p>
          <div>
            <AppButton variant="primary" @click="load">Try again</AppButton>
          </div>
        </section>

        <!-- Signed in already: one person, one account -->
        <section v-else-if="auth.me" class="flex flex-col gap-4" aria-labelledby="join-title">
          <h1 id="join-title" class="text-[30px] font-semibold tracking-[-0.03em]">You’re already signed in</h1>
          <p class="text-ink-3">
            You’re signed in as <strong class="font-medium text-ink">{{ auth.me.name }}</strong> ({{ auth.me.email }}). Sign out to
            create a new account with this invite to {{ place }}.
          </p>
          <div class="flex flex-wrap gap-2.5">
            <AppButton variant="primary" @click="signOut">Sign out</AppButton>
            <AppButton @click="router.push(auth.homePath)">Go to Offday</AppButton>
          </div>
        </section>

        <!-- The form -->
        <form v-else class="flex flex-col gap-7" novalidate aria-labelledby="join-title" @submit="submit">
          <div class="flex flex-col gap-2">
            <h1 id="join-title" class="text-[30px] font-semibold tracking-[-0.03em]">Create your account</h1>
            <p class="text-ink-3">
              Join <strong class="font-semibold text-ink">{{ place }}</strong> as {{ invite ? roleLabel(invite.role) : '' }}.
            </p>
          </div>

          <div class="flex flex-col gap-3.5">
            <div class="flex flex-col gap-1.5">
              <label for="join-name" class="text-[13px] font-medium">Full name</label>
              <input
                id="join-name"
                :ref="(el) => (inputs.name = el as HTMLInputElement | null)"
                v-model="name"
                v-bind="nameAttrs"
                type="text"
                autocomplete="name"
                :maxlength="NAME_MAX"
                placeholder="e.g. Zoé Martin"
                class="field-input"
                :class="{ 'field-input-error': errors.name }"
                :aria-invalid="!!errors.name"
                aria-describedby="join-name-error"
              />
              <p id="join-name-error" class="text-[12px] text-danger" aria-live="polite">{{ errors.name }}</p>
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="join-email" class="flex justify-between text-[13px] font-medium">
                Work email
                <span v-if="emailLocked" class="font-normal text-muted">Set by your invite</span>
              </label>
              <input
                id="join-email"
                :ref="(el) => (inputs.email = el as HTMLInputElement | null)"
                v-model="email"
                v-bind="emailAttrs"
                type="email"
                autocomplete="email"
                placeholder="name@company.com"
                :readonly="emailLocked"
                class="field-input"
                :class="[{ 'field-input-error': errors.email }, emailLocked ? 'cursor-default bg-canvas text-ink-2 focus:bg-canvas' : '']"
                :aria-invalid="!!errors.email"
                aria-describedby="join-email-error"
              />
              <p id="join-email-error" class="text-[12px] text-danger" aria-live="polite">
                {{ errors.email }}
                <RouterLink v-if="emailTaken" :to="{ name: 'login' }" class="font-medium text-ink underline underline-offset-2">
                  Sign in instead
                </RouterLink>
              </p>
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="join-password" class="text-[13px] font-medium">Password</label>
              <input
                id="join-password"
                :ref="(el) => (inputs.password = el as HTMLInputElement | null)"
                v-model="password"
                v-bind="passwordAttrs"
                type="password"
                autocomplete="new-password"
                placeholder="••••••••••"
                class="field-input"
                :class="{ 'field-input-error': errors.password }"
                :aria-invalid="!!errors.password"
                aria-describedby="join-password-hint"
              />
              <p id="join-password-hint" class="text-[12px]" :class="errors.password ? 'text-danger' : 'text-ink-3'" aria-live="polite">
                {{ errors.password ?? PASSWORD_HINT }}
              </p>
            </div>

            <div v-if="generalError" role="alert" class="rounded-xl bg-danger-tint px-3.5 py-3 text-[13px] leading-[1.45] text-danger-strong">
              {{ generalError }}
            </div>

            <AppButton type="submit" variant="primary" size="lg" class="mt-1" :loading="isSubmitting">
              Create account and sign in
            </AppButton>
          </div>

          <p class="border-t border-line-divider pt-5 text-[13px] text-ink-3">
            Already have an account?
            <RouterLink :to="{ name: 'login' }" class="font-medium text-ink underline underline-offset-2">Sign in</RouterLink>
          </p>
        </form>
      </div>

      <div class="flex flex-col justify-between gap-10 bg-night p-12 text-white max-sm:p-6">
        <p class="font-mono text-eyebrow uppercase text-night-text">{{ place || 'Offday' }}</p>
        <div class="flex flex-col gap-3">
          <p class="text-pretty text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">
            {{ invite && state === 'ready' ? 'You’re invited to Offday.' : 'Time off, without the email thread.' }}
          </p>
          <p class="max-w-[340px] leading-normal text-faint">
            Request leave, see who's out, and get a decision — all in one place.
          </p>
        </div>
        <div v-if="invite && state === 'ready'" class="flex flex-col gap-2">
          <div class="flex flex-col gap-1 rounded-xl border border-night-line bg-night-card px-3.5 py-3">
            <span class="text-[13px] font-medium">{{ roleLabel(invite.role) }}</span>
            <span class="text-[12px] leading-normal text-night-text">{{ ROLE_DESCRIPTIONS[invite.role] }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 rounded-xl border border-night-line bg-night-card px-3.5 py-3">
            <span class="text-[13px] font-medium">{{ invite.email ? 'Personal invite' : 'Team invite' }}</span>
            <span class="font-mono text-[12px] text-night-text">Expires {{ expires }}</span>
          </div>
        </div>
        <div v-else class="h-px" aria-hidden="true" />
      </div>
    </div>
  </div>
</template>
