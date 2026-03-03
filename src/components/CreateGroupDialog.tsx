import { useState } from "react";
import { Users, Search, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCreateGroupChat } from "@/hooks/useGroupChat";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog to create a group conversation.
 * User enters group name, searches for members, and creates the group.
 */
export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { user } = useAuth();
  const createGroup = useCreateGroupChat();

  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<
    Array<{ id: string; username: string; display_name: string; avatar_url: string | null }>
  >([]);

  // Search users
  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ["search-users-group", searchQuery],
    enabled: searchQuery.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .neq("id", user?.id ?? "")
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleMember = (member: { id: string; username: string; display_name: string; avatar_url: string | null }) => {
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m.id === member.id);
      if (exists) return prev.filter((m) => m.id !== member.id);
      return [...prev, member];
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;

    createGroup.mutate(
      {
        name: groupName.trim(),
        memberIds: selectedMembers.map((m) => m.id),
      },
      {
        onSuccess: () => {
          setGroupName("");
          setSearchQuery("");
          setSelectedMembers([]);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            New Group Chat
          </DialogTitle>
          <DialogDescription>
            Create a group with your friends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Group name */}
          <Input
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-1 bg-primary/10 text-primary rounded-full pl-1 pr-2 py-0.5 text-xs"
                >
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[8px]">
                      {member.display_name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.username}</span>
                  <button onClick={() => toggleMember(member)}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search members */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search people to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Results */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {isLoading && (
              <div className="text-center py-4 text-sm text-muted-foreground">Searching...</div>
            )}
            {searchResults
              .filter((u: any) => !selectedMembers.some((m) => m.id === u.id))
              .map((u: any) => (
                <button
                  key={u.id}
                  onClick={() =>
                    toggleMember({
                      id: u.id,
                      username: u.username,
                      display_name: u.display_name,
                      avatar_url: u.avatar_url,
                    })
                  }
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition text-left"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={u.avatar_url ?? undefined} />
                    <AvatarFallback>{u.display_name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                  </div>
                </button>
              ))}
            {searchQuery.length >= 2 && !isLoading && searchResults.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">No users found</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedMembers.length === 0 || createGroup.isPending}
          >
            {createGroup.isPending ? "Creating..." : "Create Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
