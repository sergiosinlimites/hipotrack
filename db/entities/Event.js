const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'Event',
  tableName: 'events',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    type: {
      type: String,
    },
    filepath: {
      type: String,
      nullable: true,
    },
    payload: {
      type: 'jsonb',
      nullable: true,
    },
    created_at: {
      type: 'timestamptz',
      createDate: true,
    },
  },
  relations: {
    camera: {
      type: 'many-to-one',
      target: 'Camera',
      joinColumn: {
        name: 'camera_id',
      },
      onDelete: 'SET NULL',
      nullable: true,
    },
  },
});


