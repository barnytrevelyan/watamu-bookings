'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

interface Room {
  id: string;
  name: string;
  room_type: string;
  beds: number;
  max_guests: number;
  price_override: number | null;
  sort_order: number;
}

const ROOM_TYPES = ['bedroom', 'suite', 'dormitory', 'studio', 'loft'];

export default function RoomsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const propertyId = params.id as string;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [propertyName, setPropertyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Form fields
  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState('bedroom');
  const [beds, setBeds] = useState('1');
  const [roomMaxGuests, setRoomMaxGuests] = useState('2');
  const [priceOverride, setPriceOverride] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchRooms();
  }, [user, propertyId]);

  async function fetchRooms() {
    try {
      const supabase = createClient();

      // Verify ownership
      const { data: property } = await supabase
        .from('wb_properties')
        .select('name')
        .eq('id', propertyId)
        .eq('owner_id', user!.id)
        .single();

      if (!property) {
        setError('Property not found or unauthorized');
        setLoading(false);
        return;
      }

      setPropertyName(property.name);

      const { data, error: fetchError } = await supabase
        .from('wb_rooms')
        .select('*')
        .eq('property_id', propertyId)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      setRooms(data || []);
    } catch (err) {
      setError('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingRoom(null);
    setRoomName('');
    setRoomType('bedroom');
    setBeds('1');
    setRoomMaxGuests('2');
    setPriceOverride('');
    setShowModal(true);
  }

  function openEditModal(room: Room) {
    setEditingRoom(room);
    setRoomName(room.name);
    setRoomType(room.room_type);
    setBeds(room.beds.toString());
    setRoomMaxGuests(room.max_guests.toString());
    setPriceOverride(room.price_override?.toString() || '');
    setShowModal(true);
  }

  async function handleSaveRoom() {
    if (!roomName.trim()) {
      setError('Room name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const roomData = {
        property_id: propertyId,
        name: roomName.trim(),
        room_type: roomType,
        beds: parseInt(beds),
        max_guests: parseInt(roomMaxGuests),
        price_override: priceOverride ? parseFloat(priceOverride) : null,
        sort_order: editingRoom ? editingRoom.sort_order : rooms.length,
      };

      if (editingRoom) {
        const { error: updateErr } = await supabase
          .from('wb_rooms')
          .update(roomData)
          .eq('id', editingRoom.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('wb_rooms')
          .insert(roomData);
        if (insertErr) throw insertErr;
      }

      setShowModal(false);
      fetchRooms();
    } catch (err: any) {
      setError(err.message || 'Failed to save room');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoom(id: string) {
    if (!confirm('Are you sure you want to delete this room?')) return;

    try {
      const supabase = createClient();
      const { error: delErr } = await supabase
        .from('wb_rooms')
        .delete()
        .eq('id', id);
      if (delErr) throw delErr;
      setRooms((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError('Failed to delete room');
    }
  }

  function handleDragStart(index: number) {
    setDraggedIdx(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const updated = [...rooms];
    const [dragged] = updated.splice(draggedIdx, 1);
    updated.splice(index, 0, dragged);
    setRooms(updated);
    setDraggedIdx(index);
  }

  async function handleDragEnd() {
    setDraggedIdx(null);
    // Persist new order
    const supabase = createClient();
    const updates = rooms.map((room, i) => ({
      id: room.id,
      sort_order: i,
      property_id: propertyId,
      name: room.name,
      room_type: room.room_type,
      beds: room.beds,
      max_guests: room.max_guests,
    }));

    for (const u of updates) {
      await supabase
        .from('wb_rooms')
        .update({ sort_order: u.sort_order })
        .eq('id', u.id);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push(`/dashboard/properties/${propertyId}`)}>
            &larr; Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rooms</h1>
            <p className="text-sm text-gray-500">{propertyName}</p>
          </div>
        </div>
        <Button onClick={openAddModal}>+ Add Room</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {rooms.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12">
          <h2 className="text-lg font-semibold text-gray-900">No rooms yet</h2>
          <p className="mt-2 text-center text-gray-500">
            Add individual rooms to your property for more detailed listings.
          </p>
          <Button onClick={openAddModal} className="mt-4">
            Add First Room
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Drag rows to reorder rooms.
          </p>
          {rooms.map((room, index) => (
            <Card
              key={room.id}
              className={`flex items-center gap-4 p-4 transition-shadow ${
                draggedIdx === index ? 'shadow-lg ring-2 ring-teal-300' : ''
              }`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e: React.DragEvent) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="cursor-grab text-gray-400">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{room.name}</h3>
                <p className="text-sm text-gray-500">
                  {room.room_type} &middot; {room.beds} bed{room.beds !== 1 ? 's' : ''} &middot; up to {room.max_guests} guests
                </p>
              </div>
              {room.price_override && (
                <span className="text-sm font-medium text-gray-700">
                  KES {room.price_override.toLocaleString()}/night
                </span>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEditModal(room)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteRoom(room.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Room Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingRoom ? 'Edit Room' : 'Add Room'}
          </h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Room Name *</label>
            <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Master Bedroom" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Room Type</label>
            <Select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Beds</label>
              <Input type="number" min="1" value={beds} onChange={(e) => setBeds(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Max Guests</label>
              <Input type="number" min="1" value={roomMaxGuests} onChange={(e) => setRoomMaxGuests(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Price Override (optional)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              placeholder="Leave empty to use property base price"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoom} disabled={saving}>
              {saving ? 'Saving...' : editingRoom ? 'Update Room' : 'Add Room'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
