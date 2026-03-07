import { useEffect, useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCollections,
  useCreateCollection,
  useAddVideoToCollection,
  useRemoveVideoFromCollection,
  useVideoCollectionMembership,
} from "@/hooks/useCollections";
import { cn } from "@/lib/utils";

interface SaveToCollectionDialogProps {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SaveToCollectionDialog = ({
  videoId,
  open,
  onOpenChange,
}: SaveToCollectionDialogProps) => {
  const { data: collections = [], isLoading } = useCollections();
  const { data: collectionMembership = [] } = useVideoCollectionMembership(videoId);
  const createCollection = useCreateCollection();
  const addToCollection = useAddVideoToCollection();
  const removeFromCollection = useRemoveVideoFromCollection();

  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<string[]>([]);

  useEffect(() => {
    setPendingAdds([]);
    setPendingRemoves([]);
  }, [videoId, open]);

  const effectiveMembership = useMemo(() => {
    const membership = new Set(collectionMembership);
    pendingAdds.forEach((collectionId) => membership.add(collectionId));
    pendingRemoves.forEach((collectionId) => membership.delete(collectionId));
    return membership;
  }, [collectionMembership, pendingAdds, pendingRemoves]);

  const handleCreateAndAdd = () => {
    if (!newCollectionName.trim()) return;

    createCollection.mutate(
      {
        name: newCollectionName,
        is_public: false,
      },
      {
        onSuccess: (newCollection) => {
          addToCollection.mutate({
            collection_id: newCollection.id,
            video_id: videoId,
          }, {
            onSuccess: () => {
              setPendingAdds((prev) => [...new Set([...prev, newCollection.id])]);
            },
            onSettled: () => {
              setPendingAdds((prev) => prev.filter((id) => id !== newCollection.id));
            },
          });
          setNewCollectionName("");
          setIsCreating(false);
        },
      }
    );
  };

  const handleToggle = (collection: any, isInCollection: boolean) => {
    if (isInCollection) {
      setPendingRemoves((prev) => [...new Set([...prev, collection.id])]);
      setPendingAdds((prev) => prev.filter((id) => id !== collection.id));
      removeFromCollection.mutate({
        collection_id: collection.id,
        video_id: videoId,
      }, {
        onError: () => {
          setPendingRemoves((prev) => prev.filter((id) => id !== collection.id));
        },
        onSettled: () => {
          setPendingRemoves((prev) => prev.filter((id) => id !== collection.id));
        },
      });
    } else {
      setPendingAdds((prev) => [...new Set([...prev, collection.id])]);
      setPendingRemoves((prev) => prev.filter((id) => id !== collection.id));
      addToCollection.mutate({
        collection_id: collection.id,
        video_id: videoId,
      }, {
        onError: () => {
          setPendingAdds((prev) => prev.filter((id) => id !== collection.id));
        },
        onSettled: () => {
          setPendingAdds((prev) => prev.filter((id) => id !== collection.id));
        },
      });
    }
  };

  const isInCollection = (collectionId: string) => {
    return effectiveMembership.has(collectionId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save to Collection</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-14 bg-gray-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {collections.map((collection: any) => {
                const inCollection = isInCollection(collection.id);
                return (
                  <button
                    key={collection.id}
                    onClick={() => handleToggle(collection, inCollection)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all hover:bg-gray-50",
                      inCollection
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          collection.cover_url
                            ? ""
                            : "bg-gradient-to-br from-gray-200 to-gray-300"
                        )}
                      >
                        {collection.cover_url ? (
                          <img
                            src={collection.cover_url}
                            alt=""
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <span className="text-lg">📁</span>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-sm">
                          {collection.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {collection.video_count} videos
                        </p>
                      </div>
                    </div>
                    {inCollection && (
                      <Check className="w-5 h-5 text-blue-500" />
                    )}
                  </button>
                );
              })}

              {/* Create new collection */}
              {isCreating ? (
                <div className="p-3 border-2 border-dashed border-gray-300 rounded-lg space-y-2">
                  <Input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateAndAdd();
                      if (e.key === "Escape") {
                        setIsCreating(false);
                        setNewCollectionName("");
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateAndAdd}
                      disabled={
                        !newCollectionName.trim() || createCollection.isPending
                      }
                      className="flex-1"
                    >
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsCreating(false);
                        setNewCollectionName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-gray-500" />
                  </div>
                  <span className="font-medium text-sm text-gray-700">
                    Create new collection
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {collections.length === 0 && !isLoading && !isCreating && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-4">
              No collections yet. Create one to get started!
            </p>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Collection
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
