const { EntitySchema } = require('typeorm');

module.exports = new EntitySchema({
  name: 'EnergySample',
  tableName: 'energy_samples',
  columns: {
    id: {
      primary: true,
      type: 'uuid',
      generated: 'uuid',
    },
    voltage: {
      type: 'float',
    },
    current: {
      type: 'float',
    },
    watts: {
      type: 'float',
    },
    cpu_temp: {
      type: 'float',
    },
    measured_at: {
      type: 'timestamptz',
      nullable: false,
    },
  },
  relations: {
    camera: {
      type: 'many-to-one',
      target: 'Camera',
      joinColumn: {
        name: 'camera_id',
      },
      onDelete: 'CASCADE',
      nullable: false,
    },
  },
});


