<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useForm } from 'vee-validate';
import { DateTime } from 'luxon';
import { toApiError } from '@/api/errors';
import * as invitationsApi from '@/api/invitations';
import type { InvitationKind, InvitationStatus, InvitationSummary, OfficeDetails, Role } from '@/api/types';
import AppButton from '@/components/ui/AppButton.vue';
import SegmentedTabs from '@/components/ui/SegmentedTabs.vue';
import type { SegmentedOption } from '@/components/ui/types';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { roleLabel } from '@/utils/roles';
import {
  LABEL_MAX,
  MAX_USES,
  type InviteFormField,
  buildInviteFormSchema,
  defaultInviteFormValues,
  expiryChoicesFor,
} from '@/validation/inviteForm';
import { toTypedSchema } from '@/validation/zodTypedSchema';

/**
 * Invite links of one office: the list, revoking, and creating a link. A new link is shown once,
 * right after it's created; the server keeps only a hash of it.
 */
const props = defineProps<{ office: OfficeDetails }>();

const auth = useAuthStore();
const toast = useToast();
const { confirm } = useConfirmStore();

const invitations = ref<InvitationSummary[]>([]);
const loading = ref(true);
const filter = ref<'active' | 'all'>('active');
const revokingId = ref<number | null>(null);
/** The link just created: only available until this section closes. */
const created = ref<{ id: number; link: string; invitation: InvitationSummary } | null>(null);
const copied = ref(false);
const linkInput = ref<HTMLInputElement | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    invitations.value = await invitationsApi.listInvitations(props.office.id);
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const active = computed(() => invitations.value.filter((i) => i.status === 'Active'));
const shown = computed(() => (filter.value === 'active' ? active.value : invitations.value));
const filterOptions = computed<SegmentedOption<'active' | 'all'>[]>(() => [
  { value: 'active', label: 'Active', count: loading.value ? null : active.value.length },
  { value: 'all', label: 'All', count: loading.value ? null : invitations.value.length },
]);

// ---- Presenting a link -----------------------------------------------------------

const zone = computed(() => auth.timezone);
const at = (iso: string) => DateTime.fromISO(iso).setZone(zone.value);
const exact = (iso: string) => at(iso).toFormat("ccc d LLL yyyy 'at' HH:mm");

function title(invitation: InvitationSummary): string {
  return invitation.label ?? (invitation.kind === 'personal' ? invitation.email! : 'Team link');
}

function when(invitation: InvitationSummary): { text: string; tooltip: string } {
  if (invitation.status === 'Revoked' && invitation.revokedAt) {
    return { text: `Revoked ${at(invitation.revokedAt).toFormat('d LLL')}`, tooltip: `Revoked ${exact(invitation.revokedAt)}` };
  }
  const expires = at(invitation.expiresAt);
  const past = expires <= DateTime.now();
  return {
    text: past ? `Expired ${expires.toFormat('d LLL')}` : `Expires ${expires.toRelative() ?? ''}`,
    tooltip: `${past ? 'Expired' : 'Expires'} ${exact(invitation.expiresAt)}`,
  };
}

const STATUS_LABELS: Record<Exclude<InvitationStatus, 'Active'>, string> = {
  Expired: 'Expired',
  Revoked: 'Revoked',
  UsedUp: 'Used up',
  CreatorLostAccess: 'Creator lost access',
};

// ---- Revoking ------------------------------------------------------------------

async function revoke(invitation: InvitationSummary): Promise<void> {
  if (revokingId.value !== null) return;
  const confirmed = await confirm({
    title: 'Revoke this invite link?',
    body: `“${title(invitation)}” stops working right away. People who already joined ${props.office.name} keep their accounts.`,
    confirmLabel: 'Revoke link',
    tone: 'danger',
  });
  if (!confirmed) return;

  revokingId.value = invitation.id;
  try {
    await invitationsApi.revokeInvitation(props.office.id, invitation.id);
    const revokedAt = new Date().toISOString();
    invitations.value = invitations.value.map((i) => (i.id === invitation.id ? { ...i, status: 'Revoked', revokedAt } : i));
    if (created.value?.id === invitation.id) created.value = null;
    toast.success('Invite link revoked', `“${title(invitation)}” no longer works.`);
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    revokingId.value = null;
  }
}

// ---- Creating ------------------------------------------------------------------

const schema = buildInviteFormSchema();
const formOpen = ref(false);
const { defineField, errors, handleSubmit, resetForm, setErrors, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: defaultInviteFormValues(),
});

const [kind] = defineField('kind');
const [role] = defineField('role');
const [email, emailAttrs] = defineField('email');
const [maxUses, maxUsesAttrs] = defineField('maxUses');
const [expiresInDays] = defineField('expiresInDays');
const [label, labelAttrs] = defineField('label');
const emailInput = ref<HTMLInputElement | null>(null);
const maxUsesInput = ref<HTMLInputElement | null>(null);
const generalError = ref<string>();

const kindOptions: SegmentedOption<InvitationKind>[] = [
  { value: 'personal', label: 'Personal' },
  { value: 'team', label: 'Team' },
];

// Admin rights only through a personal link: the option isn't offered on a team link.
const roleOptions = computed<SegmentedOption<Role>[]>(() => [
  { value: 'Requester', label: roleLabel('Requester') },
  { value: 'Validator', label: roleLabel('Validator') },
  ...(kind.value === 'personal' ? [{ value: 'WorkspaceAdmin' as Role, label: roleLabel('WorkspaceAdmin') }] : []),
]);

const expiryOptions = computed<SegmentedOption<string>[]>(() =>
  expiryChoicesFor(role.value ?? 'Requester').map((days) => ({ value: String(days), label: days === 1 ? '1 day' : `${days} days` })),
);
/** SegmentedTabs works with strings; the form keeps a number. */
const expiry = computed({
  get: () => String(expiresInDays.value),
  set: (value: string) => (expiresInDays.value = Number(value)),
});

watch(kind, (next) => {
  if (next === 'team' && role.value === 'WorkspaceAdmin') role.value = 'Requester';
});
watch(role, (next) => {
  const choices = expiryChoicesFor(next ?? 'Requester');
  if (!choices.includes(expiresInDays.value ?? 0)) expiresInDays.value = next === 'WorkspaceAdmin' ? choices[choices.length - 1] : 7;
});

const KIND_HINTS: Record<InvitationKind, string> = {
  personal: 'For one person: only their email can use it, once.',
  team: 'For several people: anyone with the link can join until it runs out of uses.',
};

async function openForm(): Promise<void> {
  resetForm({ values: defaultInviteFormValues() });
  generalError.value = undefined;
  formOpen.value = true;
  await nextTick();
  emailInput.value?.focus();
}

const submit = handleSubmit(
  // vee-validate passes the schema's output, which is already the API payload. (Parsing it again with the
  // form schema failed, because the payload lacks form-only fields such as maxUses, and nothing was sent.)
  async (payload) => {
    generalError.value = undefined;
    try {
      const result = await invitationsApi.createInvitation(props.office.id, payload);
      invitations.value = [result.invitation, ...invitations.value];
      created.value = { id: result.invitation.id, link: `${window.location.origin}/join/${result.token}`, invitation: result.invitation };
      copied.value = false;
      formOpen.value = false;
      filter.value = 'active';
    } catch (err) {
      const error = toApiError(err);
      const fields = error.fieldErrors;
      if (Object.keys(fields).length) setErrors(fields as Partial<Record<InviteFormField, string>>);
      else generalError.value = error.message;
    }
  },
  async ({ errors: invalid }) => {
    await nextTick();
    if (invalid.email) emailInput.value?.focus();
    else if (invalid.maxUses) maxUsesInput.value?.focus();
  },
);

// ---- The one-time link -----------------------------------------------------------

async function copyLink(): Promise<void> {
  if (!created.value) return;
  try {
    await navigator.clipboard.writeText(created.value.link);
    copied.value = true;
    toast.success('Link copied', 'Share it with the people it’s meant for.');
  } catch {
    // Clipboard access can be refused (permissions, insecure context): leave the link selected instead.
    linkInput.value?.focus();
    linkInput.value?.select();
    toast.info('Couldn’t copy automatically', 'The link is selected: press Ctrl+C (⌘C on a Mac) to copy it.');
  }
}

function describeCreated(invitation: InvitationSummary): string {
  const who = invitation.kind === 'personal' ? `Only ${invitation.email} can use it, once` : `Up to ${invitation.maxUses} people can join`;
  return `${who}, as ${roleLabel(invitation.role).toLowerCase()} in ${props.office.name}. ${when(invitation).text}.`;
}
</script>

<template>
  <section class="flex flex-col gap-3 border-t border-line-divider pt-6" aria-labelledby="office-drawer-invites">
    <div class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h3 id="office-drawer-invites" class="text-[15px] font-semibold">Invite links</h3>
        <p class="text-[13px] text-ink-3">
          People who open a link create their own account in {{ office.name }}, with the link’s role.
        </p>
      </div>
      <AppButton v-if="!formOpen" size="sm" @click="openForm">New invite link</AppButton>
    </div>

    <!-- Shown once, right after creating -->
    <div v-if="created" class="flex flex-col gap-3 rounded-[14px] border border-ink bg-accent-row p-4" role="status" aria-live="polite">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-[13px] font-semibold">Your invite link is ready</p>
        <span class="eyebrow">Shown once</span>
      </div>
      <p class="text-[13px] text-ink-2">{{ describeCreated(created.invitation) }}</p>
      <div class="flex gap-2">
        <input
          ref="linkInput"
          :value="created.link"
          readonly
          aria-label="Invite link"
          class="field-input bg-surface font-mono text-[12px]"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <AppButton variant="primary" @click="copyLink">{{ copied ? 'Copied' : 'Copy' }}</AppButton>
      </div>
      <div class="flex items-center justify-between gap-3">
        <p class="text-[12px] text-ink-3">You won’t see this link again. If it’s lost, revoke it and create a new one.</p>
        <AppButton size="xs" variant="subtle" @click="created = null">Done</AppButton>
      </div>
    </div>

    <!-- New link -->
    <form v-if="formOpen" class="flex flex-col gap-4 rounded-[14px] border border-line p-4" novalidate aria-label="New invite link" @submit="submit">
      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-[13px] font-medium">Kind</legend>
        <SegmentedTabs v-model="kind" :options="kindOptions" label="Kind of link" class="self-start" />
        <p class="text-[12px] text-ink-3">{{ KIND_HINTS[kind ?? 'personal'] }}</p>
      </fieldset>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-[13px] font-medium">Role</legend>
        <SegmentedTabs v-model="role" :options="roleOptions" label="Role given by the link" class="self-start" />
        <p class="text-[12px]" :class="errors.role ? 'text-danger' : 'text-ink-3'" aria-live="polite">
          {{ errors.role ?? (kind === 'personal' ? 'Workspace admin is only offered on personal links.' : 'Team links give requester or validator rights.') }}
        </p>
      </fieldset>

      <div v-if="kind === 'personal'" class="flex flex-col gap-1.5">
        <label for="invite-email" class="text-[13px] font-medium">Email</label>
        <input
          id="invite-email"
          ref="emailInput"
          v-model="email"
          v-bind="emailAttrs"
          type="email"
          autocomplete="off"
          placeholder="name@company.com"
          class="field-input"
          :class="{ 'field-input-error': errors.email }"
          :aria-invalid="!!errors.email"
          aria-describedby="invite-email-error"
        />
        <p id="invite-email-error" class="text-[12px] text-danger" aria-live="polite">{{ errors.email }}</p>
      </div>
      <div v-else class="flex flex-col gap-1.5">
        <label for="invite-uses" class="text-[13px] font-medium">Number of uses</label>
        <input
          id="invite-uses"
          ref="maxUsesInput"
          v-model="maxUses"
          v-bind="maxUsesAttrs"
          type="text"
          inputmode="numeric"
          class="field-input w-[120px] font-mono"
          :class="{ 'field-input-error': errors.maxUses }"
          :aria-invalid="!!errors.maxUses"
          aria-describedby="invite-uses-hint"
        />
        <p id="invite-uses-hint" class="text-[12px]" :class="errors.maxUses ? 'text-danger' : 'text-ink-3'" aria-live="polite">
          {{ errors.maxUses ?? `How many people can join with it, up to ${MAX_USES}.` }}
        </p>
      </div>

      <fieldset class="flex flex-col gap-1.5">
        <legend class="mb-1.5 text-[13px] font-medium">Expires after</legend>
        <SegmentedTabs v-model="expiry" :options="expiryOptions" label="Expires after" class="self-start" />
        <p class="text-[12px]" :class="errors.expiresInDays ? 'text-danger' : 'text-ink-3'" aria-live="polite">
          {{ errors.expiresInDays ?? (role === 'WorkspaceAdmin' ? 'Admin links expire within 72 hours.' : 'Unused links stop working after this.') }}
        </p>
      </fieldset>

      <div class="flex flex-col gap-1.5">
        <label for="invite-label" class="flex justify-between text-[13px] font-medium">
          Label <span class="font-normal text-muted">Optional, only admins see it</span>
        </label>
        <input
          id="invite-label"
          v-model="label"
          v-bind="labelAttrs"
          type="text"
          :maxlength="LABEL_MAX"
          placeholder="e.g. Autumn hires"
          class="field-input"
          :class="{ 'field-input-error': errors.label }"
          :aria-invalid="!!errors.label"
          aria-describedby="invite-label-error"
        />
        <p id="invite-label-error" class="text-[12px] text-danger" aria-live="polite">{{ errors.label }}</p>
      </div>

      <div v-if="generalError" role="alert" class="rounded-xl bg-danger-tint px-3.5 py-3 text-[13px] leading-[1.45] text-danger-strong">
        {{ generalError }}
      </div>

      <div class="flex justify-end gap-2.5">
        <AppButton size="sm" :disabled="isSubmitting" @click="formOpen = false">Cancel</AppButton>
        <AppButton size="sm" type="submit" variant="primary" :loading="isSubmitting">Create link</AppButton>
      </div>
    </form>

    <!-- Existing links -->
    <SegmentedTabs v-model="filter" :options="filterOptions" label="Which invite links to show" class="self-start" />

    <div v-if="loading" class="flex flex-col gap-1.5">
      <div v-for="n in 2" :key="n" class="h-[58px] animate-pulse rounded-control bg-canvas" />
    </div>
    <p v-else-if="!shown.length" class="rounded-control bg-surface-subtle px-3 py-4 text-center text-[13px] text-muted">
      {{ filter === 'active' ? 'No active invite links.' : 'No invite links yet.' }}
    </p>
    <ul v-else class="flex flex-col gap-1.5">
      <li
        v-for="invitation in shown"
        :key="invitation.id"
        class="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5"
        :class="invitation.status === 'Active' ? '' : 'opacity-70'"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex min-w-0 items-center gap-2">
            <span v-tooltip.truncated="title(invitation)" class="truncate text-[13px] font-medium">{{ title(invitation) }}</span>
            <span class="shrink-0 rounded-full bg-canvas px-2 py-[2px] text-[11px] font-medium text-ink-2">{{ roleLabel(invitation.role) }}</span>
            <span
              v-if="invitation.status !== 'Active'"
              class="shrink-0 rounded-full px-2 py-[2px] text-[11px] font-medium"
              :class="invitation.status === 'Revoked' ? 'bg-rejected-bg text-rejected-fg' : 'bg-line-divider text-ink-3'"
            >
              {{ STATUS_LABELS[invitation.status] }}
            </span>
          </span>
          <span class="truncate font-mono text-[11px] text-muted">
            {{ invitation.kind === 'personal' ? 'Personal' : 'Team' }}
            <template v-if="invitation.label && invitation.email"> · {{ invitation.email }}</template>
            · {{ invitation.useCount }}/{{ invitation.maxUses }} {{ invitation.maxUses === 1 ? 'use' : 'uses' }}
            · <span v-tooltip="when(invitation).tooltip">{{ when(invitation).text }}</span>
            · {{ invitation.createdBy ? `by ${invitation.createdBy.name}` : 'creator removed' }}
          </span>
        </div>
        <AppButton
          v-if="invitation.status === 'Active'"
          size="xs"
          variant="reject"
          :loading="revokingId === invitation.id"
          :disabled="revokingId !== null && revokingId !== invitation.id"
          @click="revoke(invitation)"
        >
          Revoke
        </AppButton>
      </li>
    </ul>
  </section>
</template>
