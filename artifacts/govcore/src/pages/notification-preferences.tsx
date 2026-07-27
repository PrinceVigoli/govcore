import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetMe,
  useListNotificationPreferences,
  useSetNotificationPreference,
  getGetMeQueryKey,
  getListNotificationPreferencesQueryKey,
  NotificationPreferenceInputChannel,
} from '@workspace/api-client-react';
import type { NotificationPreference, NotificationPreferenceInputChannel as ChannelValue } from '@workspace/api-client-react';
import { Bell, Mail, MessageSquare, Smartphone, Megaphone, Loader2, SlidersHorizontal, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

const CHANNELS = Object.values(NotificationPreferenceInputChannel);

const CHANNEL_META: Record<ChannelValue, { label: string; description: string; icon: typeof Mail }> = {
  email: { label: 'Email', description: 'Delivered to your registered email address.', icon: Mail },
  sms: { label: 'SMS', description: 'Text messages to your registered phone number.', icon: MessageSquare },
  push: { label: 'Push', description: 'Mobile and browser push notifications.', icon: Smartphone },
  in_app: { label: 'In-App', description: 'Notifications shown inside GovCore itself.', icon: Bell },
  announcement: { label: 'Announcements', description: 'Tenant-wide announcements and broadcasts.', icon: Megaphone },
};

export default function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newEventType, setNewEventType] = useState('');
  const [newChannel, setNewChannel] = useState<ChannelValue>(NotificationPreferenceInputChannel.email);

  const { data: me, isLoading: meLoading } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() },
  });

  const listParams = { userId: me?.id as number };
  const { data: preferences, isLoading: prefsLoading } = useListNotificationPreferences(listParams, {
    query: { enabled: !!me, queryKey: getListNotificationPreferencesQueryKey(listParams) },
  });

  const setPrefMutation = useSetNotificationPreference();

  const isLoading = meLoading || (!!me && prefsLoading);

  const defaults = useMemo(() => {
    const map = new Map<ChannelValue, NotificationPreference>();
    preferences?.forEach((p) => {
      if (!p.eventType) map.set(p.channel, p);
    });
    return map;
  }, [preferences]);

  const overrides = useMemo(
    () => (preferences ?? []).filter((p) => !!p.eventType).sort((a, b) => a.channel.localeCompare(b.channel)),
    [preferences],
  );

  const isChannelEnabled = (channel: ChannelValue) => defaults.get(channel)?.enabled ?? true;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListNotificationPreferencesQueryKey(listParams) });
  };

  const savePreference = (channel: ChannelValue, eventType: string | null, enabled: boolean) => {
    if (!me) return;
    setPrefMutation.mutate(
      { data: { tenantId: me.tenantId, userId: me.id, channel, eventType: eventType ?? undefined, enabled } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: 'Preference saved' });
        },
        onError: (err) => {
          toast({ title: 'Failed to save preference', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const addOverride = () => {
    if (!newEventType.trim()) {
      toast({ title: 'Enter an event type first', variant: 'destructive' });
      return;
    }
    savePreference(newChannel, newEventType.trim(), false);
    setNewEventType('');
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center">
          <SlidersHorizontal className="mr-2 h-6 w-6 text-primary" />
          Notification Preferences
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which channels notify you by default, and mute specific event types if you need to.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel Defaults</CardTitle>
          <CardDescription>
            Applies to every notification on that channel unless you set a specific override below. A channel
            with no preference saved yet is treated as enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {CHANNELS.map((channel, i) => {
            const meta = CHANNEL_META[channel];
            const Icon = meta.icon;
            return (
              <div key={channel}>
                {i > 0 && <Separator className="my-1" />}
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-start">
                    <Icon className="h-5 w-5 text-muted-foreground mr-3 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium leading-none">{meta.label}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">{meta.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isChannelEnabled(channel)}
                    disabled={setPrefMutation.isPending}
                    onCheckedChange={(checked) => savePreference(channel, null, checked)}
                    data-testid={`switch-channel-${channel}`}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Type Overrides</CardTitle>
          <CardDescription>
            Mute or unmute a specific event type on a specific channel, without changing the channel's default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Event type</label>
              <Input
                placeholder="e.g. workflow.reminder"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-44 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <Select value={newChannel} onValueChange={(v) => setNewChannel(v as ChannelValue)}>
                <SelectTrigger data-testid="select-override-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>{CHANNEL_META[c].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addOverride} disabled={setPrefMutation.isPending} data-testid="button-add-override">
              <Plus className="h-4 w-4 mr-1.5" />
              Add muted override
            </Button>
          </div>

          <Separator />

          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No event-specific overrides yet. Everything follows the channel defaults above.
            </p>
          ) : (
            <div className="space-y-1">
              {overrides.map((pref, i) => {
                const meta = CHANNEL_META[pref.channel];
                return (
                  <div key={pref.id}>
                    {i > 0 && <Separator className="my-1" />}
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium font-mono">{pref.eventType}</p>
                        <p className="text-xs text-muted-foreground mt-1">via {meta.label}</p>
                      </div>
                      <Switch
                        checked={pref.enabled}
                        disabled={setPrefMutation.isPending}
                        onCheckedChange={(checked) => savePreference(pref.channel, pref.eventType ?? null, checked)}
                        data-testid={`switch-override-${pref.id}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
